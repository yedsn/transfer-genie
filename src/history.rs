use crate::filenames::{message_remote_path, timestamp_bucket_key};
use crate::types::{MarkedTag, WebDavEndpoint};
use crate::webdav::{self, ConditionalFileStatus};
use crate::workspace;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const LEGACY_HISTORY_PATH: &str = "history.json";
pub const HISTORY_INDEX_PATH: &str = "history/index.json";
pub const HISTORY_TAGS_PATH: &str = "history/tags.json";
const HISTORY_INDEX_VERSION: u8 = 1;
const HISTORY_CACHE_METADATA: &str = "history-cache-metadata.json";

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct HistoryEntry {
    pub filename: String,
    pub sender: String,
    pub timestamp_ms: i64,
    pub size: i64,
    pub kind: String,
    pub original_name: String,
    #[serde(default)]
    pub remote_path: Option<String>,
    #[serde(default)]
    pub marked: bool,
    #[serde(default)]
    pub marked_tag_ids: Vec<String>,
    #[serde(default)]
    pub marked_pinned: bool,
    #[serde(default)]
    pub marked_due_date: Option<String>,
    #[serde(default)]
    pub format: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HistoryLayout {
    Manifest,
    Legacy,
    Empty,
}

pub struct LoadedHistory {
    pub entries: Vec<HistoryEntry>,
    pub layout: HistoryLayout,
    pub tags: Vec<MarkedTag>,
}

pub struct HistoryMutationResult {
    pub all_entries: Vec<HistoryEntry>,
    pub touched_paths: Vec<String>,
}

pub type HistoryEntryTarget = (String, i64);

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
struct HistoryIndex {
    version: u8,
    shards: Vec<HistoryShardRef>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
struct HistoryShardRef {
    key: String,
    path: String,
    count: usize,
    start_timestamp_ms: Option<i64>,
    end_timestamp_ms: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
struct HistoryShard {
    entries: Vec<HistoryEntry>,
}

#[derive(Default, Serialize, Deserialize)]
struct CacheMetadata {
    #[serde(default)]
    files: HashMap<String, CachedRemoteFile>,
}

#[derive(Default, Serialize, Deserialize)]
struct CachedRemoteFile {
    #[serde(default)]
    etag: Option<String>,
    #[serde(default)]
    last_modified: Option<String>,
}

pub async fn load_history_with_layout(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<LoadedHistory, String> {
    if let Ok(Some(entries)) = load_manifest_remote(client, endpoint).await {
        let tags = load_marked_tags_remote(client, endpoint).await?;
        return Ok(LoadedHistory {
            entries,
            layout: HistoryLayout::Manifest,
            tags,
        });
    }

    let entries = load_legacy_history_remote(client, endpoint).await?;
    let tags = load_marked_tags_remote(client, endpoint).await?;
    let layout = if entries.is_empty() {
        HistoryLayout::Empty
    } else {
        HistoryLayout::Legacy
    };
    Ok(LoadedHistory {
        entries,
        layout,
        tags,
    })
}

pub async fn load_history_for_sync(
    client: &Client,
    endpoint: &WebDavEndpoint,
    cache_dir: &Path,
) -> Result<LoadedHistory, String> {
    fs::create_dir_all(cache_dir).map_err(|err| format!("鍒涘缓鍘嗗彶缂撳瓨鐩綍澶辫触: {err}"))?;
    let mut metadata = read_cache_metadata(cache_dir)?;

    let Some(index_path) = refresh_cached_file(
        client,
        endpoint,
        cache_dir,
        &mut metadata,
        HISTORY_INDEX_PATH,
    )
    .await?
    else {
        let entries =
            load_legacy_history_cached(client, endpoint, cache_dir, &mut metadata).await?;
        let tags = load_marked_tags_cached(client, endpoint, cache_dir, &mut metadata).await?;
        write_cache_metadata(cache_dir, &metadata)?;
        let layout = if entries.is_empty() {
            HistoryLayout::Empty
        } else {
            HistoryLayout::Legacy
        };
        return Ok(LoadedHistory {
            entries,
            layout,
            tags,
        });
    };

    let index_bytes =
        fs::read(&index_path).map_err(|err| format!("读取历史索引文件失败：{err}"))?;
    let index = serde_json::from_slice::<HistoryIndex>(&index_bytes)
        .map_err(|err| format!("解析历史索引文件失败：{err}"))?;

    let mut entries = Vec::new();
    for shard in &index.shards {
        let Some(shard_path) =
            refresh_cached_file(client, endpoint, cache_dir, &mut metadata, &shard.path).await?
        else {
            // 索引引用的分片在远端已缺失（清理旧数据后索引与分片可能短暂不一致），
            // 跳过该分片而不是让整个刷新失败，后续变更会重建索引以清理失效引用。
            continue;
        };
        let shard_bytes =
            fs::read(&shard_path).map_err(|err| format!("读取历史分片图像缓存失败：{err}"))?;
        entries.extend(parse_manifest_shard(&shard_bytes)?);
    }

    let tags = load_marked_tags_cached(client, endpoint, cache_dir, &mut metadata).await?;
    write_cache_metadata(cache_dir, &metadata)?;
    Ok(LoadedHistory {
        entries: dedupe_and_sort(entries),
        layout: HistoryLayout::Manifest,
        tags,
    })
}

pub async fn save_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
    history: &[HistoryEntry],
    tags: &[MarkedTag],
) -> Result<(), String> {
    let history = dedupe_and_sort(history.to_vec());
    let mut grouped: BTreeMap<String, Vec<HistoryEntry>> = BTreeMap::new();
    for entry in history {
        let key = timestamp_bucket_key(entry.timestamp_ms).unwrap_or_else(|| "legacy".to_string());
        grouped.entry(key).or_default().push(entry);
    }

    let mut shards = Vec::new();
    for (key, mut entries) in grouped {
        entries.sort_by_key(|entry| entry.timestamp_ms);
        let path = format!("history/shards/{key}.json");
        let shard = HistoryShard {
            entries: entries
                .into_iter()
                .map(|entry| normalize_manifest_entry(entry))
                .collect(),
        };
        let data = serde_json::to_vec_pretty(&shard)
            .map_err(|err| format!("搴忓垪鍖栧巻鍙插垎鐗囧け璐? {err}"))?;
        webdav::upload_file_ensuring_parent(client, endpoint, &path, data).await?;
        shards.push(HistoryShardRef {
            key,
            path,
            count: shard.entries.len(),
            start_timestamp_ms: shard.entries.first().map(|entry| entry.timestamp_ms),
            end_timestamp_ms: shard.entries.last().map(|entry| entry.timestamp_ms),
        });
    }

    let index = HistoryIndex {
        version: HISTORY_INDEX_VERSION,
        shards,
    };
    let data =
        serde_json::to_vec_pretty(&index).map_err(|err| format!("序列化历史索引失败：{err}"))?;
    webdav::upload_file_ensuring_parent(client, endpoint, HISTORY_INDEX_PATH, data).await?;

    let tags_data =
        serde_json::to_vec_pretty(tags).map_err(|err| format!("序列化历史标签失败：{err}"))?;
    webdav::upload_file_ensuring_parent(client, endpoint, HISTORY_TAGS_PATH, tags_data).await
}

pub async fn save_marked_tags(
    client: &Client,
    endpoint: &WebDavEndpoint,
    tags: &[MarkedTag],
) -> Result<(), String> {
    let tags_data =
        serde_json::to_vec_pretty(tags).map_err(|err| format!("序列化历史标签失败：{err}"))?;
    webdav::upload_file_ensuring_parent(client, endpoint, HISTORY_TAGS_PATH, tags_data).await
}

pub fn invalidate_history_cache_paths(
    cache_dir: &Path,
    remote_paths: &[String],
) -> Result<(), String> {
    if remote_paths.is_empty() || !cache_dir.exists() {
        return Ok(());
    }
    let mut metadata = read_cache_metadata(cache_dir)?;
    for remote_path in remote_paths {
        metadata.files.remove(remote_path);
        let local_path = cache_local_path(cache_dir, remote_path);
        let _ = fs::remove_file(local_path);
    }
    write_cache_metadata(cache_dir, &metadata)
}

pub async fn upsert_history_entries(
    client: &Client,
    endpoint: &WebDavEndpoint,
    entries: Vec<HistoryEntry>,
) -> Result<HistoryMutationResult, String> {
    upsert_history_entries_with_prior(client, endpoint, entries, &HashMap::new()).await
}

pub async fn upsert_history_entries_with_prior(
    client: &Client,
    endpoint: &WebDavEndpoint,
    entries: Vec<HistoryEntry>,
    prior_timestamps: &HashMap<String, i64>,
) -> Result<HistoryMutationResult, String> {
    let mut keys = HashSet::new();
    for entry in &entries {
        keys.insert(shard_key_for_timestamp(entry.timestamp_ms));
        if let Some(prior_timestamp) = prior_timestamps.get(&entry.filename) {
            keys.insert(shard_key_for_timestamp(*prior_timestamp));
        }
    }

    mutate_manifest_history_keys(client, endpoint, &keys, |index, shards| {
        for entry in entries.iter().cloned() {
            let entry = normalize_manifest_entry(entry);
            remove_entry_from_shards(shards, &entry.filename);
            let key = shard_key_for_timestamp(entry.timestamp_ms);
            shards.entry(key).or_default().push(entry.clone());
        }
        let all_entries = rebuild_index_from_shards(index, shards);
        Ok(HistoryMutationResult {
            all_entries,
            touched_paths: Vec::new(),
        })
    })
    .await
}

pub async fn mutate_history_entries_by_targets<F>(
    client: &Client,
    endpoint: &WebDavEndpoint,
    targets: &[HistoryEntryTarget],
    mut mutator: F,
) -> Result<HistoryMutationResult, String>
where
    F: FnMut(&mut HistoryEntry) -> bool,
{
    if targets.is_empty() {
        return Ok(HistoryMutationResult {
            all_entries: Vec::new(),
            touched_paths: Vec::new(),
        });
    }

    let filenames: HashSet<String> = targets
        .iter()
        .map(|(filename, _)| filename.clone())
        .collect();
    let keys: HashSet<String> = targets
        .iter()
        .map(|(_, timestamp_ms)| shard_key_for_timestamp(*timestamp_ms))
        .collect();

    mutate_manifest_history_keys(client, endpoint, &keys, |index, shards| {
        for entries in shards.values_mut() {
            for entry in entries.iter_mut() {
                if !filenames.contains(&entry.filename) {
                    continue;
                }
                if mutator(entry) {
                    *entry = normalize_manifest_entry(entry.clone());
                }
            }
        }
        let all_entries = rebuild_index_from_shards(index, shards);
        Ok(HistoryMutationResult {
            all_entries,
            touched_paths: Vec::new(),
        })
    })
    .await
}

pub async fn append_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
    entry: HistoryEntry,
) -> Result<(), String> {
    upsert_history_entries(client, endpoint, vec![entry])
        .await
        .map(|_| ())
}

pub async fn remove_history_entry_targets(
    client: &Client,
    endpoint: &WebDavEndpoint,
    targets: &[HistoryEntryTarget],
) -> Result<HistoryMutationResult, String> {
    if targets.is_empty() {
        return Ok(HistoryMutationResult {
            all_entries: Vec::new(),
            touched_paths: Vec::new(),
        });
    }
    let filenames: HashSet<String> = targets
        .iter()
        .map(|(filename, _)| filename.clone())
        .collect();
    let keys: HashSet<String> = targets
        .iter()
        .map(|(_, timestamp_ms)| shard_key_for_timestamp(*timestamp_ms))
        .collect();
    mutate_manifest_history_keys(client, endpoint, &keys, |index, shards| {
        for entries in shards.values_mut() {
            entries.retain(|entry| !filenames.contains(&entry.filename));
        }
        let all_entries = rebuild_index_from_shards(index, shards);
        Ok(HistoryMutationResult {
            all_entries,
            touched_paths: Vec::new(),
        })
    })
    .await
}

async fn mutate_manifest_history_keys<F>(
    client: &Client,
    endpoint: &WebDavEndpoint,
    keys: &HashSet<String>,
    mut mutate: F,
) -> Result<HistoryMutationResult, String>
where
    F: FnMut(
        &mut HistoryIndex,
        &mut BTreeMap<String, Vec<HistoryEntry>>,
    ) -> Result<HistoryMutationResult, String>,
{
    let mut index = match load_manifest_index_remote(client, endpoint).await? {
        Some(index) => index,
        None => {
            let loaded = load_history_with_layout(client, endpoint).await?;
            let mut grouped = group_history_by_shard(loaded.entries);
            let mut index = HistoryIndex {
                version: HISTORY_INDEX_VERSION,
                shards: Vec::new(),
            };
            let mut result = mutate(&mut index, &mut grouped)?;
            save_history(client, endpoint, &result.all_entries, &loaded.tags).await?;
            result.touched_paths = full_manifest_paths(&index);
            return Ok(result);
        }
    };

    let original_refs: BTreeMap<String, HistoryShardRef> = index
        .shards
        .iter()
        .cloned()
        .map(|shard| (shard.key.clone(), shard))
        .collect();
    let mut shards =
        match load_manifest_shards_by_key_remote(client, endpoint, &original_refs, keys).await {
            Ok(shards) => shards,
            Err(_) => {
                let loaded = load_history_with_layout(client, endpoint).await?;
                let mut grouped = group_history_by_shard(loaded.entries);
                let mut rebuild_index = HistoryIndex {
                    version: HISTORY_INDEX_VERSION,
                    shards: Vec::new(),
                };
                let mut result = mutate(&mut rebuild_index, &mut grouped)?;
                save_history(client, endpoint, &result.all_entries, &loaded.tags).await?;
                result.touched_paths = full_manifest_paths(&rebuild_index);
                return Ok(result);
            }
        };
    for key in keys {
        shards.entry(key.clone()).or_default();
    }
    let original_shards = shards.clone();
    index.shards = original_refs.values().cloned().collect();
    let mut result = mutate(&mut index, &mut shards)?;
    let mut index_refs: BTreeMap<String, HistoryShardRef> = original_refs.clone();

    for (key, entries) in shards.iter_mut() {
        let mut deduped = dedupe_and_sort(std::mem::take(entries));
        for entry in deduped.iter_mut() {
            *entry = normalize_manifest_entry(entry.clone());
        }
        *entries = deduped;
        if entries.is_empty() {
            index_refs.remove(key);
        } else {
            let next_ref = build_shard_ref(key, entries);
            index_refs.insert(key.clone(), next_ref);
        }
    }
    // rebuild_index_from_shards（在 mutate 闭包内调用）会用 retain 移除空分片，
    // 因此上面的循环看不到这些键。这里补齐：对 keys 中已被裁掉的分片，
    // 同步从 index_refs 移除其失效引用，避免索引指向不存在的分片。
    for key in keys {
        if !shards.contains_key(key) {
            index_refs.remove(key);
        }
    }
    index.version = HISTORY_INDEX_VERSION;
    index.shards = index_refs.values().cloned().collect();

    let mut touched_paths = Vec::new();
    for key in keys {
        let entries = shards.get(key).cloned().unwrap_or_default();
        if entries.is_empty() {
            if let Some(old_ref) = original_refs.get(key) {
                webdav::delete_file(client, endpoint, &old_ref.path, true).await?;
                touched_paths.push(old_ref.path.clone());
            }
            continue;
        }
        let shard_ref = build_shard_ref(key, &entries);
        if original_shards.get(key) != Some(&entries) {
            upload_manifest_shard(client, endpoint, &shard_ref.path, &entries).await?;
            touched_paths.push(shard_ref.path.clone());
        }
    }

    let original_index = HistoryIndex {
        version: HISTORY_INDEX_VERSION,
        shards: original_refs.values().cloned().collect(),
    };
    if index.shards != original_index.shards || index.version != original_index.version {
        upload_history_index(client, endpoint, &index).await?;
        touched_paths.push(HISTORY_INDEX_PATH.to_string());
    }

    result.all_entries = collect_entries_from_shards(&shards);
    touched_paths.sort();
    touched_paths.dedup();
    result.touched_paths = touched_paths;
    Ok(result)
}

fn full_manifest_paths(index: &HistoryIndex) -> Vec<String> {
    let mut paths = vec![
        HISTORY_INDEX_PATH.to_string(),
        HISTORY_TAGS_PATH.to_string(),
    ];
    paths.extend(index.shards.iter().map(|shard| shard.path.clone()));
    paths.sort();
    paths.dedup();
    paths
}

async fn load_manifest_index_remote(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Option<HistoryIndex>, String> {
    let Some(index_bytes) =
        webdav::download_optional_file(client, endpoint, HISTORY_INDEX_PATH).await?
    else {
        return Ok(None);
    };
    serde_json::from_slice::<HistoryIndex>(&index_bytes)
        .map(Some)
        .map_err(|err| format!("解析历史索引失败：{err}"))
}

async fn load_manifest_shards_by_key_remote(
    client: &Client,
    endpoint: &WebDavEndpoint,
    refs: &BTreeMap<String, HistoryShardRef>,
    keys: &HashSet<String>,
) -> Result<BTreeMap<String, Vec<HistoryEntry>>, String> {
    let mut shards = BTreeMap::new();
    for key in keys {
        let Some(shard_ref) = refs.get(key) else {
            continue;
        };
        match webdav::download_optional_file(client, endpoint, &shard_ref.path).await? {
            Some(shard_bytes) => {
                shards.insert(key.clone(), parse_manifest_shard(&shard_bytes)?);
            }
            None => {
                // 引用的分片在远端已不存在（清理旧数据后索引与分片可能不一致），
                // 视为空分片，让后续变更逻辑重建索引并清理失效引用。
                shards.insert(key.clone(), Vec::new());
            }
        }
    }
    Ok(shards)
}

async fn upload_history_index(
    client: &Client,
    endpoint: &WebDavEndpoint,
    index: &HistoryIndex,
) -> Result<(), String> {
    let data =
        serde_json::to_vec_pretty(index).map_err(|err| format!("序列化历史索引失败：{err}"))?;
    webdav::upload_file_ensuring_parent(client, endpoint, HISTORY_INDEX_PATH, data).await
}

async fn upload_manifest_shard(
    client: &Client,
    endpoint: &WebDavEndpoint,
    path: &str,
    entries: &[HistoryEntry],
) -> Result<(), String> {
    let shard = HistoryShard {
        entries: entries
            .iter()
            .cloned()
            .map(normalize_manifest_entry)
            .collect(),
    };
    let data =
        serde_json::to_vec_pretty(&shard).map_err(|err| format!("序列化历史分片失败：{err}"))?;
    webdav::upload_file_ensuring_parent(client, endpoint, path, data).await
}

fn shard_key_for_timestamp(timestamp_ms: i64) -> String {
    timestamp_bucket_key(timestamp_ms).unwrap_or_else(|| "legacy".to_string())
}

fn group_history_by_shard(history: Vec<HistoryEntry>) -> BTreeMap<String, Vec<HistoryEntry>> {
    let mut grouped: BTreeMap<String, Vec<HistoryEntry>> = BTreeMap::new();
    for entry in dedupe_and_sort(history) {
        grouped
            .entry(shard_key_for_timestamp(entry.timestamp_ms))
            .or_default()
            .push(normalize_manifest_entry(entry));
    }
    grouped
}

fn build_shard_ref(key: &str, entries: &[HistoryEntry]) -> HistoryShardRef {
    HistoryShardRef {
        key: key.to_string(),
        path: format!("history/shards/{key}.json"),
        count: entries.len(),
        start_timestamp_ms: entries.first().map(|entry| entry.timestamp_ms),
        end_timestamp_ms: entries.last().map(|entry| entry.timestamp_ms),
    }
}

fn rebuild_index_from_shards(
    index: &mut HistoryIndex,
    shards: &mut BTreeMap<String, Vec<HistoryEntry>>,
) -> Vec<HistoryEntry> {
    for entries in shards.values_mut() {
        let mut deduped = dedupe_and_sort(std::mem::take(entries));
        for entry in deduped.iter_mut() {
            *entry = normalize_manifest_entry(entry.clone());
        }
        *entries = deduped;
    }
    shards.retain(|_, entries| !entries.is_empty());
    index.version = HISTORY_INDEX_VERSION;
    index.shards = shards
        .iter()
        .map(|(key, entries)| build_shard_ref(key, entries))
        .collect();
    collect_entries_from_shards(shards)
}

fn collect_entries_from_shards(shards: &BTreeMap<String, Vec<HistoryEntry>>) -> Vec<HistoryEntry> {
    dedupe_and_sort(
        shards
            .values()
            .flat_map(|entries| entries.iter().cloned())
            .collect(),
    )
}

fn remove_entry_from_shards(
    shards: &mut BTreeMap<String, Vec<HistoryEntry>>,
    filename: &str,
) -> Option<HistoryEntry> {
    let mut removed = None;
    for entries in shards.values_mut() {
        if let Some(index) = entries.iter().position(|entry| entry.filename == filename) {
            removed = Some(entries.remove(index));
            break;
        }
    }
    removed
}

async fn load_manifest_remote(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Option<Vec<HistoryEntry>>, String> {
    let Some(index_bytes) =
        webdav::download_optional_file(client, endpoint, HISTORY_INDEX_PATH).await?
    else {
        return Ok(None);
    };
    let index = serde_json::from_slice::<HistoryIndex>(&index_bytes)
        .map_err(|err| format!("解析历史索引失败：{err}"))?;

    let mut entries = Vec::new();
    for shard in index.shards {
        match webdav::download_optional_file(client, endpoint, &shard.path).await? {
            Some(shard_bytes) => entries.extend(parse_manifest_shard(&shard_bytes)?),
            None => {
                // 索引引用的分片在远端缺失，跳过该分片而不是让整个加载失败。
                // 这通常发生在清理旧数据后索引与分片短暂不一致时。
                continue;
            }
        }
    }
    Ok(Some(dedupe_and_sort(entries)))
}

async fn load_legacy_history_remote(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Vec<HistoryEntry>, String> {
    let bytes = webdav::download_optional_file(client, endpoint, LEGACY_HISTORY_PATH).await?;
    match bytes {
        Some(data) => parse_legacy_history(&data),
        None => Ok(Vec::new()),
    }
}

async fn load_legacy_history_cached(
    client: &Client,
    endpoint: &WebDavEndpoint,
    cache_dir: &Path,
    metadata: &mut CacheMetadata,
) -> Result<Vec<HistoryEntry>, String> {
    let Some(local_path) =
        refresh_cached_file(client, endpoint, cache_dir, metadata, LEGACY_HISTORY_PATH).await?
    else {
        return Ok(Vec::new());
    };
    let data = fs::read(&local_path).map_err(|err| format!("读取遗留历史缓存失败：{err}"))?;
    parse_legacy_history(&data)
}

async fn load_marked_tags_remote(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Vec<MarkedTag>, String> {
    let bytes = webdav::download_optional_file(client, endpoint, HISTORY_TAGS_PATH).await?;
    match bytes {
        Some(data) => parse_marked_tags(&data),
        None => Ok(Vec::new()),
    }
}

async fn load_marked_tags_cached(
    client: &Client,
    endpoint: &WebDavEndpoint,
    cache_dir: &Path,
    metadata: &mut CacheMetadata,
) -> Result<Vec<MarkedTag>, String> {
    let Some(local_path) =
        refresh_cached_file(client, endpoint, cache_dir, metadata, HISTORY_TAGS_PATH).await?
    else {
        return Ok(Vec::new());
    };
    let data = fs::read(&local_path).map_err(|err| format!("读取历史标签缓存失败：{err}"))?;
    parse_marked_tags(&data)
}

fn parse_legacy_history(data: &[u8]) -> Result<Vec<HistoryEntry>, String> {
    let entries = serde_json::from_slice::<Vec<HistoryEntry>>(data)
        .map_err(|err| format!("解析遗留历史记录失败：{err}"))?;
    Ok(dedupe_and_sort(
        entries
            .into_iter()
            .map(|entry| normalize_legacy_entry(entry))
            .collect(),
    ))
}

fn parse_manifest_shard(data: &[u8]) -> Result<Vec<HistoryEntry>, String> {
    let shard = serde_json::from_slice::<HistoryShard>(data)
        .map_err(|err| format!("解析历史分片失败：{err}"))?;
    Ok(shard
        .entries
        .into_iter()
        .map(normalize_manifest_entry)
        .collect())
}

fn parse_marked_tags(data: &[u8]) -> Result<Vec<MarkedTag>, String> {
    let mut tags = serde_json::from_slice::<Vec<MarkedTag>>(data)
        .map_err(|err| format!("解析历史标签失败：{err}"))?;
    tags.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(tags)
}

fn normalize_legacy_entry(mut entry: HistoryEntry) -> HistoryEntry {
    if entry.remote_path.is_none() {
        entry.remote_path = Some(format!("files/{}", entry.filename));
    }
    if entry.format.is_empty() {
        entry.format = "text".to_string();
    }
    entry.marked_tag_ids.sort();
    entry.marked_tag_ids.dedup();
    entry.marked_due_date = normalize_history_due_date(entry.marked_due_date);
    entry
}

fn normalize_manifest_entry(mut entry: HistoryEntry) -> HistoryEntry {
    if entry.remote_path.is_none() {
        entry.remote_path = Some(message_remote_path(&entry.filename, entry.timestamp_ms));
    }
    if entry.format.is_empty() {
        entry.format = "text".to_string();
    }
    entry.marked_tag_ids.sort();
    entry.marked_tag_ids.dedup();
    entry.marked_due_date = normalize_history_due_date(entry.marked_due_date);
    entry
}

fn normalize_history_due_date(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| is_valid_due_date(item))
}

fn is_valid_due_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn dedupe_and_sort(entries: Vec<HistoryEntry>) -> Vec<HistoryEntry> {
    let mut deduped = BTreeMap::new();
    for entry in entries {
        deduped.insert(entry.filename.clone(), entry);
    }
    let mut entries: Vec<HistoryEntry> = deduped.into_values().collect();
    entries.sort_by_key(|entry| entry.timestamp_ms);
    entries
}

fn cache_local_path(cache_dir: &Path, remote_path: &str) -> PathBuf {
    remote_path
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .fold(cache_dir.to_path_buf(), |path, part| path.join(part))
}

fn read_cache_metadata(cache_dir: &Path) -> Result<CacheMetadata, String> {
    let path = cache_dir.join(HISTORY_CACHE_METADATA);
    if !path.is_file() {
        return Ok(CacheMetadata::default());
    }
    let data = fs::read(&path).map_err(|err| format!("读取历史缓存元数据失败：{err}"))?;
    Ok(serde_json::from_slice::<CacheMetadata>(&data).unwrap_or_default())
}

fn write_cache_metadata(cache_dir: &Path, metadata: &CacheMetadata) -> Result<(), String> {
    workspace::write_json_with_audit_at(
        &cache_dir.join(HISTORY_CACHE_METADATA),
        metadata,
        None,
        "history-cache",
        "write-metadata",
    )
}

async fn refresh_cached_file(
    client: &Client,
    endpoint: &WebDavEndpoint,
    cache_dir: &Path,
    metadata: &mut CacheMetadata,
    remote_path: &str,
) -> Result<Option<PathBuf>, String> {
    let cached_path = cache_local_path(cache_dir, remote_path);
    let prior = metadata.files.get(remote_path);
    let response = webdav::download_optional_file_conditional(
        client,
        endpoint,
        remote_path,
        prior.and_then(|item| item.etag.as_deref()),
        prior.and_then(|item| item.last_modified.as_deref()),
    )
    .await?;

    match response.status {
        ConditionalFileStatus::Modified(data) => {
            if let Some(parent) = cached_path.parent() {
                fs::create_dir_all(parent).map_err(|err| format!("创建缓存目录失败: {err}"))?;
            }
            fs::write(&cached_path, data).map_err(|err| format!("写入缓存失败: {err}"))?;
            metadata.files.insert(
                remote_path.to_string(),
                CachedRemoteFile {
                    etag: response.etag,
                    last_modified: response.last_modified,
                },
            );
            Ok(Some(cached_path))
        }
        ConditionalFileStatus::NotModified => {
            if cached_path.is_file() {
                metadata.files.insert(
                    remote_path.to_string(),
                    CachedRemoteFile {
                        etag: response
                            .etag
                            .or_else(|| prior.and_then(|item| item.etag.clone())),
                        last_modified: response
                            .last_modified
                            .or_else(|| prior.and_then(|item| item.last_modified.clone())),
                    },
                );
                return Ok(Some(cached_path));
            }

            let bytes = webdav::download_optional_file(client, endpoint, remote_path).await?;
            match bytes {
                Some(data) => {
                    if let Some(parent) = cached_path.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|err| format!("创建缓存目录失败: {err}"))?;
                    }
                    fs::write(&cached_path, data).map_err(|err| format!("写入缓存失败: {err}"))?;
                    Ok(Some(cached_path))
                }
                None => {
                    metadata.files.remove(remote_path);
                    Ok(None)
                }
            }
        }
        ConditionalFileStatus::Missing => {
            metadata.files.remove(remote_path);
            let _ = fs::remove_file(&cached_path);
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::WebDavEndpoint;
    use serde::de::DeserializeOwned;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::Mutex;
    use tokio::task::JoinHandle;

    #[test]
    fn history_entry_json_round_trip_preserves_fields() {
        let entries = vec![HistoryEntry {
            filename: "1700000000000__Alice__12345678__message.txt".to_string(),
            sender: "Alice".to_string(),
            timestamp_ms: 1_700_000_000_000,
            size: 128,
            kind: "text".to_string(),
            original_name: "message.txt".to_string(),
            remote_path: Some(
                "files/2023/11/1700000000000__Alice__12345678__message.txt".to_string(),
            ),
            marked: false,
            marked_tag_ids: Vec::new(),
            marked_pinned: false,
            marked_due_date: None,
            format: "text".to_string(),
        }];

        let json = serde_json::to_vec_pretty(&entries).expect("serialize history");
        let decoded: Vec<HistoryEntry> =
            serde_json::from_slice(&json).expect("deserialize history");
        assert_eq!(decoded, entries);
    }

    #[test]
    fn parse_legacy_history_defaults_remote_path_to_flat_layout() {
        let decoded = parse_legacy_history(
            br#"[{"filename":"a.txt","sender":"Alice","timestamp_ms":1704067200000,"size":3,"kind":"text","original_name":"a.txt"}]"#,
        )
        .expect("parse legacy history");
        assert_eq!(decoded.len(), 1);
        assert_eq!(decoded[0].remote_path.as_deref(), Some("files/a.txt"));
    }

    #[test]
    fn parse_manifest_shard_defaults_remote_path_to_bucketed_layout() {
        let decoded = parse_manifest_shard(
            br#"{"entries":[{"filename":"a.txt","sender":"Alice","timestamp_ms":1704067200000,"size":3,"kind":"text","original_name":"a.txt"}]}"#,
        )
        .expect("parse manifest shard");
        assert_eq!(decoded.len(), 1);
        assert_eq!(
            decoded[0].remote_path.as_deref(),
            Some("files/2024/01/a.txt")
        );
    }

    fn sample_entry(filename: &str, timestamp_ms: i64) -> HistoryEntry {
        HistoryEntry {
            filename: filename.to_string(),
            sender: "Alice".to_string(),
            timestamp_ms,
            size: 3,
            kind: "text".to_string(),
            original_name: "message.txt".to_string(),
            remote_path: None,
            marked: false,
            marked_tag_ids: Vec::new(),
            marked_pinned: false,
            marked_due_date: None,
            format: "text".to_string(),
        }
    }

    #[derive(Clone, Debug)]
    struct RecordedRequest {
        method: String,
        path: String,
        body: Vec<u8>,
    }

    #[derive(Default)]
    struct MockWebDavState {
        files: HashMap<String, Vec<u8>>,
        requests: Vec<RecordedRequest>,
    }

    struct HistoryWebDavFixture {
        endpoint: WebDavEndpoint,
        state: Arc<Mutex<MockWebDavState>>,
        server: JoinHandle<()>,
    }

    impl Drop for HistoryWebDavFixture {
        fn drop(&mut self) {
            self.server.abort();
        }
    }

    impl HistoryWebDavFixture {
        async fn start(files: Vec<(&str, Vec<u8>)>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .expect("bind webdav fixture");
            let addr = listener.local_addr().expect("fixture addr");
            let state = Arc::new(Mutex::new(MockWebDavState {
                files: files
                    .into_iter()
                    .map(|(path, data)| (path.to_string(), data))
                    .collect(),
                requests: Vec::new(),
            }));
            let server_state = Arc::clone(&state);
            let server = tokio::spawn(async move {
                loop {
                    let Ok((socket, _)) = listener.accept().await else {
                        break;
                    };
                    let connection_state = Arc::clone(&server_state);
                    tokio::spawn(async move {
                        let _ = handle_mock_webdav_connection(socket, connection_state).await;
                    });
                }
            });

            Self {
                endpoint: WebDavEndpoint {
                    id: "fixture".to_string(),
                    name: "fixture".to_string(),
                    url: format!("http://{addr}/"),
                    username: String::new(),
                    password: String::new(),
                    enabled: true,
                },
                state,
                server,
            }
        }

        fn endpoint(&self) -> &WebDavEndpoint {
            &self.endpoint
        }

        async fn put_paths(&self) -> Vec<String> {
            self.state
                .lock()
                .await
                .requests
                .iter()
                .filter(|request| request.method == "PUT")
                .map(|request| request.path.clone())
                .collect()
        }

        async fn get_paths(&self) -> Vec<String> {
            self.state
                .lock()
                .await
                .requests
                .iter()
                .filter(|request| request.method == "GET")
                .map(|request| request.path.clone())
                .collect()
        }

        async fn stored_json<T: DeserializeOwned>(&self, path: &str) -> T {
            let state = self.state.lock().await;
            let data = state.files.get(path).expect("stored fixture file");
            serde_json::from_slice(data).expect("decode stored fixture json")
        }

        async fn stored_bytes(&self, path: &str) -> Option<Vec<u8>> {
            self.state.lock().await.files.get(path).cloned()
        }

        async fn put_body(&self, path: &str) -> Option<Vec<u8>> {
            self.state
                .lock()
                .await
                .requests
                .iter()
                .rev()
                .find(|request| request.method == "PUT" && request.path == path)
                .map(|request| request.body.clone())
        }
    }

    async fn handle_mock_webdav_connection(
        mut socket: tokio::net::TcpStream,
        state: Arc<Mutex<MockWebDavState>>,
    ) -> std::io::Result<()> {
        let mut received = Vec::new();
        let mut buffer = [0u8; 8192];
        let header_end = loop {
            let read = socket.read(&mut buffer).await?;
            if read == 0 {
                return Ok(());
            }
            received.extend_from_slice(&buffer[..read]);
            if let Some(index) = received
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|value| value + 4)
            {
                break index;
            }
        };

        let headers = String::from_utf8_lossy(&received[..header_end]);
        let mut lines = headers.lines();
        let request_line = lines.next().unwrap_or_default();
        let mut request_parts = request_line.split_whitespace();
        let method = request_parts.next().unwrap_or_default().to_string();
        let raw_path = request_parts.next().unwrap_or("/");
        let path = raw_path
            .split('?')
            .next()
            .unwrap_or(raw_path)
            .trim_start_matches('/')
            .trim_end_matches('/')
            .to_string();
        let content_length = headers
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            })
            .unwrap_or(0);
        let mut body = received[header_end..].to_vec();
        while body.len() < content_length {
            let read = socket.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            body.extend_from_slice(&buffer[..read]);
        }
        body.truncate(content_length);

        let (status, response_body) = {
            let mut state = state.lock().await;
            state.requests.push(RecordedRequest {
                method: method.clone(),
                path: path.clone(),
                body: body.clone(),
            });
            match method.as_str() {
                "GET" => match state.files.get(&path) {
                    Some(data) => ("200 OK", data.clone()),
                    None => ("404 Not Found", Vec::new()),
                },
                "PUT" => {
                    state.files.insert(path, body);
                    ("201 Created", Vec::new())
                }
                "MKCOL" => ("201 Created", Vec::new()),
                "DELETE" => {
                    state.files.remove(&path);
                    ("204 No Content", Vec::new())
                }
                _ => ("405 Method Not Allowed", Vec::new()),
            }
        };

        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            response_body.len()
        );
        socket.write_all(response.as_bytes()).await?;
        socket.write_all(&response_body).await?;
        Ok(())
    }

    fn serialize_json<T: Serialize>(value: &T) -> Vec<u8> {
        serde_json::to_vec_pretty(value).expect("serialize fixture json")
    }

    fn index_file(shards: Vec<HistoryShardRef>) -> Vec<u8> {
        serialize_json(&HistoryIndex {
            version: HISTORY_INDEX_VERSION,
            shards,
        })
    }

    fn shard_file(entries: Vec<HistoryEntry>) -> Vec<u8> {
        serialize_json(&HistoryShard { entries })
    }

    fn sorted_paths(mut paths: Vec<String>) -> Vec<String> {
        paths.sort();
        paths
    }

    #[test]
    fn shard_key_for_timestamp_uses_month_bucket() {
        assert_eq!(shard_key_for_timestamp(1_704_067_200_000), "2024-01");
        assert_eq!(shard_key_for_timestamp(1_706_745_600_000), "2024-02");
    }

    #[test]
    fn build_shard_ref_records_count_and_bounds() {
        let entries = vec![
            normalize_manifest_entry(sample_entry("a.txt", 1_704_067_200_000)),
            normalize_manifest_entry(sample_entry("b.txt", 1_704_153_600_000)),
        ];
        let shard_ref = build_shard_ref("2024-01", &entries);
        assert_eq!(shard_ref.key, "2024-01");
        assert_eq!(shard_ref.path, "history/shards/2024-01.json");
        assert_eq!(shard_ref.count, 2);
        assert_eq!(shard_ref.start_timestamp_ms, Some(1_704_067_200_000));
        assert_eq!(shard_ref.end_timestamp_ms, Some(1_704_153_600_000));
    }

    #[test]
    fn rebuild_index_removes_empty_shards_and_sorts_entries() {
        let mut index = HistoryIndex {
            version: HISTORY_INDEX_VERSION,
            shards: Vec::new(),
        };
        let mut shards = BTreeMap::new();
        shards.insert(
            "2024-01".to_string(),
            vec![sample_entry("b.txt", 20), sample_entry("a.txt", 10)],
        );
        shards.insert("2024-02".to_string(), Vec::new());

        let entries = rebuild_index_from_shards(&mut index, &mut shards);

        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.filename.as_str())
                .collect::<Vec<_>>(),
            vec!["a.txt", "b.txt"]
        );
        assert_eq!(index.shards.len(), 1);
        assert_eq!(index.shards[0].key, "2024-01");
        assert!(!shards.contains_key("2024-02"));
    }

    #[test]
    fn upsert_logic_moves_entry_between_shards() {
        let mut index = HistoryIndex {
            version: HISTORY_INDEX_VERSION,
            shards: Vec::new(),
        };
        let mut shards = BTreeMap::new();
        shards.insert(
            "2024-01".to_string(),
            vec![normalize_manifest_entry(sample_entry(
                "move.txt",
                1_704_067_200_000,
            ))],
        );

        let moved = normalize_manifest_entry(sample_entry("move.txt", 1_706_745_600_000));
        remove_entry_from_shards(&mut shards, &moved.filename);
        shards
            .entry(shard_key_for_timestamp(moved.timestamp_ms))
            .or_default()
            .push(moved);
        rebuild_index_from_shards(&mut index, &mut shards);

        assert!(!shards.contains_key("2024-01"));
        assert_eq!(shards.get("2024-02").map(Vec::len), Some(1));
        assert_eq!(index.shards.len(), 1);
        assert_eq!(index.shards[0].key, "2024-02");
    }

    #[tokio::test]
    async fn upsert_uploads_only_affected_shard_and_index() {
        let jan_entry = normalize_manifest_entry(sample_entry("jan.txt", 1_704_067_200_000));
        let feb_entry = normalize_manifest_entry(sample_entry("feb.txt", 1_706_745_600_000));
        let fixture = HistoryWebDavFixture::start(vec![
            (
                HISTORY_INDEX_PATH,
                index_file(vec![
                    build_shard_ref("2024-01", std::slice::from_ref(&jan_entry)),
                    build_shard_ref("2024-02", std::slice::from_ref(&feb_entry)),
                ]),
            ),
            (
                "history/shards/2024-01.json",
                shard_file(vec![jan_entry.clone()]),
            ),
            (
                "history/shards/2024-02.json",
                shard_file(vec![feb_entry.clone()]),
            ),
        ])
        .await;

        let new_jan_entry = sample_entry("jan-new.txt", 1_704_153_600_000);
        let result = upsert_history_entries(
            &Client::new(),
            fixture.endpoint(),
            vec![new_jan_entry.clone()],
        )
        .await
        .expect("upsert history entry");

        assert_eq!(
            sorted_paths(fixture.put_paths().await),
            vec![
                HISTORY_INDEX_PATH.to_string(),
                "history/shards/2024-01.json".to_string(),
            ]
        );
        assert_eq!(
            sorted_paths(result.touched_paths),
            vec![
                HISTORY_INDEX_PATH.to_string(),
                "history/shards/2024-01.json".to_string(),
            ]
        );
        assert_eq!(
            sorted_paths(fixture.get_paths().await),
            sorted_paths(vec![
                HISTORY_INDEX_PATH.to_string(),
                "history/shards/2024-01.json".to_string(),
            ])
        );

        let index: HistoryIndex = fixture.stored_json(HISTORY_INDEX_PATH).await;
        assert_eq!(index.shards.len(), 2);
        assert_eq!(index.shards[0].key, "2024-01");
        assert_eq!(index.shards[0].count, 2);
        assert_eq!(index.shards[1].key, "2024-02");
        assert_eq!(index.shards[1].count, 1);
        assert!(fixture
            .put_body("history/shards/2024-02.json")
            .await
            .is_none());
    }

    #[tokio::test]
    async fn metadata_mutation_does_not_upload_unrelated_shards_or_index() {
        let jan_entry = normalize_manifest_entry(sample_entry("jan.txt", 1_704_067_200_000));
        let feb_entry = normalize_manifest_entry(sample_entry("feb.txt", 1_706_745_600_000));
        let fixture = HistoryWebDavFixture::start(vec![
            (
                HISTORY_INDEX_PATH,
                index_file(vec![
                    build_shard_ref("2024-01", std::slice::from_ref(&jan_entry)),
                    build_shard_ref("2024-02", std::slice::from_ref(&feb_entry)),
                ]),
            ),
            (
                "history/shards/2024-01.json",
                shard_file(vec![jan_entry.clone()]),
            ),
            (
                "history/shards/2024-02.json",
                shard_file(vec![feb_entry.clone()]),
            ),
        ])
        .await;

        let targets = vec![(jan_entry.filename.clone(), jan_entry.timestamp_ms)];
        let result = mutate_history_entries_by_targets(
            &Client::new(),
            fixture.endpoint(),
            &targets,
            |entry| {
                entry.marked = true;
                entry.marked_pinned = true;
                entry.marked_tag_ids = vec!["tag-b".to_string(), "tag-a".to_string()];
                true
            },
        )
        .await
        .expect("mutate history metadata");

        assert_eq!(
            fixture.put_paths().await,
            vec!["history/shards/2024-01.json".to_string()]
        );
        assert!(fixture
            .state
            .lock()
            .await
            .requests
            .iter()
            .all(|request| request.method != "MKCOL"));
        assert_eq!(
            result.touched_paths,
            vec!["history/shards/2024-01.json".to_string()]
        );

        let shard: HistoryShard = fixture.stored_json("history/shards/2024-01.json").await;
        assert_eq!(shard.entries.len(), 1);
        assert!(shard.entries[0].marked);
        assert!(shard.entries[0].marked_pinned);
        assert_eq!(shard.entries[0].marked_tag_ids, vec!["tag-a", "tag-b"]);
        assert!(fixture.put_body(HISTORY_INDEX_PATH).await.is_none());
        assert!(fixture
            .put_body("history/shards/2024-02.json")
            .await
            .is_none());
    }

    #[tokio::test]
    async fn tags_only_write_uploads_only_tags_file() {
        let fixture = HistoryWebDavFixture::start(Vec::new()).await;
        let tags = vec![MarkedTag {
            id: "tag-a".to_string(),
            name: "重要".to_string(),
        }];

        save_marked_tags(&Client::new(), fixture.endpoint(), &tags)
            .await
            .expect("save marked tags");

        assert_eq!(
            fixture.put_paths().await,
            vec![HISTORY_TAGS_PATH.to_string()]
        );
        let stored: Vec<MarkedTag> = fixture.stored_json(HISTORY_TAGS_PATH).await;
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, "tag-a");
        assert_eq!(stored[0].name, "重要");
    }

    #[tokio::test]
    async fn legacy_history_is_read_and_converted_to_manifest_on_write() {
        let legacy_entry = sample_entry("legacy.txt", 1_704_067_200_000);
        let fixture = HistoryWebDavFixture::start(vec![(
            LEGACY_HISTORY_PATH,
            serialize_json(&vec![legacy_entry.clone()]),
        )])
        .await;

        let loaded = load_history_with_layout(&Client::new(), fixture.endpoint())
            .await
            .expect("load legacy history");
        assert_eq!(loaded.layout, HistoryLayout::Legacy);
        assert_eq!(loaded.entries.len(), 1);

        let new_entry = sample_entry("manifest.txt", 1_706_745_600_000);
        upsert_history_entries(&Client::new(), fixture.endpoint(), vec![new_entry])
            .await
            .expect("upsert converts legacy history");

        assert_eq!(
            sorted_paths(fixture.put_paths().await),
            sorted_paths(vec![
                HISTORY_INDEX_PATH.to_string(),
                HISTORY_TAGS_PATH.to_string(),
                "history/shards/2024-01.json".to_string(),
                "history/shards/2024-02.json".to_string(),
            ])
        );
        assert!(fixture.stored_bytes(LEGACY_HISTORY_PATH).await.is_some());
        assert!(fixture.put_body(LEGACY_HISTORY_PATH).await.is_none());

        let index: HistoryIndex = fixture.stored_json(HISTORY_INDEX_PATH).await;
        assert_eq!(
            index
                .shards
                .iter()
                .map(|shard| shard.key.as_str())
                .collect::<Vec<_>>(),
            vec!["2024-01", "2024-02"]
        );
    }

    struct HistoryCacheDirGuard(PathBuf);
    impl HistoryCacheDirGuard {
        fn new(name: &str) -> Self {
            static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let id = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("transfer-genie-history-test-{name}-{id}"));
            fs::create_dir_all(&path).expect("create temp cache dir");
            HistoryCacheDirGuard(path)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for HistoryCacheDirGuard {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[tokio::test]
    async fn load_history_with_layout_skips_missing_shard() {
        let jan_entry = normalize_manifest_entry(sample_entry("jan.txt", 1_704_067_200_000));
        let feb_entry = normalize_manifest_entry(sample_entry("feb.txt", 1_706_745_600_000));
        // 索引引用了 2024-02 分片，但该分片在远端缺失（清理旧数据后不一致）。
        let fixture = HistoryWebDavFixture::start(vec![
            (
                HISTORY_INDEX_PATH,
                index_file(vec![
                    build_shard_ref("2024-01", std::slice::from_ref(&jan_entry)),
                    build_shard_ref("2024-02", std::slice::from_ref(&feb_entry)),
                ]),
            ),
            (
                "history/shards/2024-01.json",
                shard_file(vec![jan_entry.clone()]),
            ),
        ])
        .await;

        let loaded = load_history_with_layout(&Client::new(), fixture.endpoint())
            .await
            .expect("load history tolerates missing shard");
        assert_eq!(loaded.layout, HistoryLayout::Manifest);
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].filename, "jan.txt");
    }

    #[tokio::test]
    async fn load_history_for_sync_skips_missing_cached_shard() {
        let jan_entry = normalize_manifest_entry(sample_entry("jan.txt", 1_704_067_200_000));
        let feb_entry = normalize_manifest_entry(sample_entry("feb.txt", 1_706_745_600_000));
        let fixture = HistoryWebDavFixture::start(vec![
            (
                HISTORY_INDEX_PATH,
                index_file(vec![
                    build_shard_ref("2024-01", std::slice::from_ref(&jan_entry)),
                    build_shard_ref("2024-02", std::slice::from_ref(&feb_entry)),
                ]),
            ),
            (
                "history/shards/2024-01.json",
                shard_file(vec![jan_entry.clone()]),
            ),
        ])
        .await;

        let cache = HistoryCacheDirGuard::new("missing-shard");
        let loaded = load_history_for_sync(&Client::new(), fixture.endpoint(), cache.path())
            .await
            .expect("load for sync tolerates missing shard");

        assert_eq!(loaded.layout, HistoryLayout::Manifest);
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].filename, "jan.txt");
    }

    #[tokio::test]
    async fn remove_history_targets_self_heals_missing_shard_in_keys() {
        let jan_entry = normalize_manifest_entry(sample_entry("jan.txt", 1_704_067_200_000));
        let feb_entry = normalize_manifest_entry(sample_entry("feb.txt", 1_706_745_600_000));
        // 2024-01 分片被索引引用但缺失，且本次删除目标落在 2024-01。
        let fixture = HistoryWebDavFixture::start(vec![
            (
                HISTORY_INDEX_PATH,
                index_file(vec![
                    build_shard_ref("2024-01", std::slice::from_ref(&jan_entry)),
                    build_shard_ref("2024-02", std::slice::from_ref(&feb_entry)),
                ]),
            ),
            (
                "history/shards/2024-02.json",
                shard_file(vec![feb_entry.clone()]),
            ),
        ])
        .await;

        let result = remove_history_entry_targets(
            &Client::new(),
            fixture.endpoint(),
            &[(jan_entry.filename.clone(), jan_entry.timestamp_ms)],
        )
        .await
        .expect("remove targets self-heals missing shard");

        // 自愈：失效的 2024-01 引用应从索引中移除。
        let index: HistoryIndex = fixture.stored_json(HISTORY_INDEX_PATH).await;
        assert_eq!(index.shards.len(), 1);
        assert_eq!(index.shards[0].key, "2024-02");
        assert!(result
            .touched_paths
            .contains(&"history/shards/2024-01.json".to_string()));
        assert!(result
            .touched_paths
            .contains(&HISTORY_INDEX_PATH.to_string()));
    }
}
