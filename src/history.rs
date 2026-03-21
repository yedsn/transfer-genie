use crate::types::WebDavEndpoint;
use crate::webdav;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct HistoryEntry {
    pub filename: String,
    pub sender: String,
    pub timestamp_ms: i64,
    pub size: i64,
    pub kind: String,
    pub original_name: String,
    #[serde(default)]
    pub marked: bool,
    #[serde(default)]
    pub format: String,
}

pub async fn load_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
) -> Result<Vec<HistoryEntry>, String> {
    let bytes = webdav::download_optional_file(client, endpoint, "history.json").await?;
    match bytes {
        Some(data) => serde_json::from_slice::<Vec<HistoryEntry>>(&data)
            .map_err(|err| format!("解析历史记录失败: {err}")),
        None => Ok(Vec::new()),
    }
}

pub async fn save_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
    history: &[HistoryEntry],
) -> Result<(), String> {
    let data =
        serde_json::to_vec_pretty(history).map_err(|err| format!("序列化历史记录失败: {err}"))?;
    webdav::upload_file(client, endpoint, "history.json", data).await
}

pub async fn append_history(
    client: &Client,
    endpoint: &WebDavEndpoint,
    entry: HistoryEntry,
) -> Result<(), String> {
    let mut history = load_history(client, endpoint).await?;
    if history.iter().any(|item| item.filename == entry.filename) {
        return Ok(());
    }
    history.push(entry);
    history.sort_by_key(|item| item.timestamp_ms);
    save_history(client, endpoint, &history).await
}

pub async fn remove_history_entries(
    client: &Client,
    endpoint: &WebDavEndpoint,
    filenames: &HashSet<String>,
) -> Result<(), String> {
    if filenames.is_empty() {
        return Ok(());
    }
    let mut history = load_history(client, endpoint).await?;
    history.retain(|entry| !filenames.contains(&entry.filename));
    save_history(client, endpoint, &history).await
}

#[cfg(test)]
mod tests {
    use super::HistoryEntry;

    #[test]
    fn history_entry_json_round_trip_preserves_fields() {
        let entries = vec![HistoryEntry {
            filename: "1700000000000__Alice__12345678__message.txt".to_string(),
            sender: "Alice".to_string(),
            timestamp_ms: 1_700_000_000_000,
            size: 128,
            kind: "text".to_string(),
            original_name: "message.txt".to_string(),
            marked: false,
            format: "text".to_string(),
        }];

        let json = serde_json::to_vec_pretty(&entries).expect("serialize history");
        let decoded: Vec<HistoryEntry> =
            serde_json::from_slice(&json).expect("deserialize history");
        assert_eq!(decoded, entries);
    }
}
