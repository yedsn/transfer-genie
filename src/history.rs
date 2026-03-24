use crate::filenames::{message_remote_path, timestamp_bucket_key};
use crate::types::{MarkedTag, WebDavEndpoint};
use crate::webdav::{self, ConditionalFileStatus};
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

#[derive(Clone, Serialize, Deserialize)]
struct HistoryIndex {
    version: u8,
    shards: Vec<HistoryShardRef>,
}

#[derive(Clone, Serialize, Deserialize)]
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

pub async fn load_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Vec<HistoryEntry>, String> {
    Ok(load_history_with_layout(client, endpoint).await?.entries)
}

pub async fn load_marked_tags(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Vec<MarkedTag>, String> {
    Ok(load_history_with_layout(client, endpoint).await?.tags)
}

pub async fn load_history_with_layout(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<LoadedHistory, String> {
    if let Some(entries) = load_manifest_remote(client, endpoint).await? {
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
        let shard_path =
            refresh_cached_file(client, endpoint, cache_dir, &mut metadata, &shard.path)
                .await?
                .ok_or_else(|| format!("历史分片图像未找到：{}", shard.path))?;
        let shard_bytes = fs::read(&shard_path)
            .map_err(|err| format!("读取历史分片图像缓存失败：{err}"))?;
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

    webdav::ensure_directory(client, endpoint, "history").await?;
    webdav::ensure_directory(client, endpoint, "history/shards").await?;

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
        webdav::upload_file(client, endpoint, &path, data).await?;
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
    let data = serde_json::to_vec_pretty(&index)
        .map_err(|err| format!("序列化历史索引失败：{err}"))?;
    webdav::upload_file(client, endpoint, HISTORY_INDEX_PATH, data).await?;

    let tags_data = serde_json::to_vec_pretty(tags)
        .map_err(|err| format!("序列化历史标签失败：{err}"))?;
    webdav::upload_file(client, endpoint, HISTORY_TAGS_PATH, tags_data).await
}

pub async fn append_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
    entry: HistoryEntry,
) -> Result<(), String> {
    let loaded = load_history_with_layout(client, endpoint).await?;
    let mut history = loaded.entries;
    if history.iter().any(|item| item.filename == entry.filename) {
        return Ok(());
    }
    history.push(entry);
    save_history(client, endpoint, &history, &loaded.tags).await
}

pub async fn remove_history_entries(
    client: &Client,
    endpoint: &WebDavEndpoint,
    filenames: &HashSet<String>,
) -> Result<(), String> {
    if filenames.is_empty() {
        return Ok(());
    }
    let loaded = load_history_with_layout(client, endpoint).await?;
    let mut history = loaded.entries;
    history.retain(|entry| !filenames.contains(&entry.filename));
    save_history(client, endpoint, &history, &loaded.tags).await
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
        let shard_bytes = webdav::download_optional_file(client, endpoint, &shard.path)
            .await?
            .ok_or_else(|| format!("历史分片图像未找到：{}", shard.path))?;
        entries.extend(parse_manifest_shard(&shard_bytes)?);
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
    let data = fs::read(&local_path)
        .map_err(|err| format!("读取历史标签缓存失败：{err}"))?;
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
    entry
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
    serde_json::from_slice::<CacheMetadata>(&data)
        .map_err(|err| format!("解析历史缓存元数据失败：{err}"))
}

fn write_cache_metadata(cache_dir: &Path, metadata: &CacheMetadata) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(metadata)
        .map_err(|err| format!("序列化历史缓存元数据失败：{err}"))?;
    fs::write(cache_dir.join(HISTORY_CACHE_METADATA), data)
        .map_err(|err| format!("写入历史缓存元数据失败：{err}"))
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
                fs::create_dir_all(parent)
                    .map_err(|err| format!("创建缓存目录失败: {err}"))?;
            }
            fs::write(&cached_path, data)
                .map_err(|err| format!("写入缓存失败: {err}"))?;
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
                    fs::write(&cached_path, data)
                        .map_err(|err| format!("写入缓存失败: {err}"))?;
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
}
