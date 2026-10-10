use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tokio::sync::{Mutex as AsyncMutex, Notify};

pub const DEFAULT_CACHE_LIMIT_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const DEFAULT_CACHE_MAX_AGE: Duration = Duration::from_secs(30 * 24 * 60 * 60);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlaybackResult {
    pub path: String,
    pub source: String,
    pub resource_key: String,
}

pub struct PlaybackJob {
    result: AsyncMutex<Option<Result<MediaPlaybackResult, String>>>,
    notify: Notify,
    cancelled: AtomicBool,
}

impl PlaybackJob {
    fn new() -> Self {
        Self {
            result: AsyncMutex::new(None),
            notify: Notify::new(),
            cancelled: AtomicBool::new(false),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    pub async fn cancelled(&self) {
        loop {
            let notified = self.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }

    pub async fn finish(&self, result: Result<MediaPlaybackResult, String>) {
        *self.result.lock().await = Some(result);
        self.notify.notify_waiters();
    }

    pub async fn wait(&self) -> Result<MediaPlaybackResult, String> {
        loop {
            let notified = self.notify.notified();
            if let Some(result) = self.result.lock().await.clone() {
                return result;
            }
            notified.await;
        }
    }
}

#[derive(Default)]
pub struct PlaybackRegistry {
    jobs: AsyncMutex<HashMap<String, Arc<PlaybackJob>>>,
    active_paths: Mutex<HashSet<PathBuf>>,
}

impl PlaybackRegistry {
    pub async fn acquire(&self, key: &str) -> (Arc<PlaybackJob>, bool) {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.get(key) {
            return (Arc::clone(job), false);
        }
        let job = Arc::new(PlaybackJob::new());
        jobs.insert(key.to_string(), Arc::clone(&job));
        (job, true)
    }

    pub async fn remove(&self, key: &str, job: &Arc<PlaybackJob>) {
        let mut jobs = self.jobs.lock().await;
        if jobs
            .get(key)
            .is_some_and(|current| Arc::ptr_eq(current, job))
        {
            jobs.remove(key);
        }
    }

    pub async fn cancel(&self, key: &str) -> bool {
        let job = self.jobs.lock().await.get(key).cloned();
        if let Some(job) = job {
            job.cancel();
            true
        } else {
            false
        }
    }

    pub fn set_active_path(&self, path: Option<PathBuf>) {
        let mut active = self
            .active_paths
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        active.clear();
        if let Some(path) = path {
            active.insert(path);
        }
    }

    pub fn active_paths(&self) -> HashSet<PathBuf> {
        self.active_paths
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone()
    }
}

pub fn touch_cache_file(path: &Path) {
    if let Ok(file) = fs::OpenOptions::new().write(true).open(path) {
        let times = fs::FileTimes::new().set_modified(SystemTime::now());
        let _ = file.set_times(times);
    }
}

pub fn maintain_cache(
    cache_dir: &Path,
    max_bytes: u64,
    max_age: Duration,
    protected: &HashSet<PathBuf>,
    now: SystemTime,
) -> Result<Vec<PathBuf>, String> {
    if !cache_dir.is_dir() {
        return Ok(Vec::new());
    }
    let root = cache_dir
        .canonicalize()
        .map_err(|err| format!("读取媒体缓存目录失败: {err}"))?;
    let protected: HashSet<PathBuf> = protected
        .iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect();
    let mut entries = Vec::new();
    for entry in fs::read_dir(&root).map_err(|err| format!("读取媒体缓存失败: {err}"))? {
        let entry = entry.map_err(|err| format!("读取媒体缓存项失败: {err}"))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|err| format!("读取媒体缓存信息失败: {err}"))?;
        if !metadata.is_file() {
            continue;
        }
        let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
        if !canonical.starts_with(&root) {
            continue;
        }
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        entries.push((path, canonical, metadata.len(), modified));
    }
    entries.sort_by_key(|entry| entry.3);
    let mut total = entries.iter().map(|entry| entry.2).sum::<u64>();
    let mut removed = Vec::new();
    for (path, canonical, size, modified) in entries {
        if protected.contains(&canonical) {
            continue;
        }
        let expired = now.duration_since(modified).unwrap_or_default() > max_age;
        let partial = path.extension().and_then(|value| value.to_str()) == Some("part");
        if partial || expired || total > max_bytes {
            fs::remove_file(&path).map_err(|err| format!("清理媒体缓存失败: {err}"))?;
            total = total.saturating_sub(size);
            removed.push(path);
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::Rng;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "transfer-genie-playback-{name}-{:016x}",
            rand::thread_rng().gen::<u64>()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn registry_deduplicates_and_allows_retry_after_removal() {
        let registry = PlaybackRegistry::default();
        let (first, owner) = registry.acquire("same").await;
        let (second, second_owner) = registry.acquire("same").await;
        assert!(owner);
        assert!(!second_owner);
        assert!(Arc::ptr_eq(&first, &second));
        first
            .finish(Ok(MediaPlaybackResult {
                path: "cached.mp4".into(),
                source: "previewCache".into(),
                resource_key: "same".into(),
            }))
            .await;
        assert_eq!(second.wait().await.unwrap().path, "cached.mp4");
        registry.remove("same", &first).await;
        let (_, retry_owner) = registry.acquire("same").await;
        assert!(retry_owner);
    }

    #[test]
    fn cache_maintenance_removes_oldest_and_protects_active_file() {
        let dir = temp_dir("maintenance");
        let first = dir.join("first.bin");
        let second = dir.join("second.bin");
        let protected_path = dir.join("protected.bin");
        fs::write(&first, vec![1; 4]).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        fs::write(&second, vec![2; 4]).unwrap();
        fs::write(&protected_path, vec![3; 4]).unwrap();
        let protected = HashSet::from([protected_path.clone()]);
        let removed = maintain_cache(
            &dir,
            8,
            Duration::from_secs(3600),
            &protected,
            SystemTime::now(),
        )
        .unwrap();
        assert_eq!(removed.len(), 1);
        assert_eq!(
            removed[0].file_name().and_then(|value| value.to_str()),
            Some("first.bin")
        );
        assert!(!first.exists());
        assert!(second.exists());
        assert!(protected_path.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn cache_maintenance_never_leaves_its_root() {
        let dir = temp_dir("boundary");
        let cache = dir.join("cache");
        fs::create_dir_all(&cache).unwrap();
        let outside = dir.join("outside.bin");
        fs::write(&outside, b"keep").unwrap();
        fs::write(cache.join("inside.part"), b"remove").unwrap();
        maintain_cache(
            &cache,
            0,
            Duration::ZERO,
            &HashSet::new(),
            SystemTime::now(),
        )
        .unwrap();
        assert!(outside.exists());
        let _ = fs::remove_dir_all(dir);
    }
}
