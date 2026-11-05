use serde::Serialize;

#[cfg_attr(not(any(target_os = "ios", test)), allow(dead_code))]
pub const SHARE_IMPORT_EVENT: &str = "transfer-genie-share-import";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareImportEvent {
    pub batch_id: String,
    pub url: String,
}

pub fn parse_share_import_url(value: &str) -> Result<ShareImportEvent, String> {
    let value = value.trim();
    let (scheme, remainder) = value
        .split_once("://")
        .ok_or_else(|| "分享链接缺少 URL scheme".to_string())?;
    if !scheme.eq_ignore_ascii_case("transfergenie") {
        return Err("不支持的分享链接 scheme".into());
    }
    let (route, query) = remainder
        .split_once('?')
        .ok_or_else(|| "分享链接缺少批次参数".to_string())?;
    if !route.eq_ignore_ascii_case("share-import") {
        return Err("不支持的分享链接路径".into());
    }
    let batch_id = query
        .split('&')
        .filter_map(|part| part.split_once('='))
        .find(|(key, _)| *key == "batch")
        .map(|(_, value)| value)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "分享链接缺少批次参数".to_string())?;
    let batch_id = urlencoding::decode(batch_id)
        .map_err(|_| "分享批次参数编码无效".to_string())?
        .into_owned();
    uuid::Uuid::parse_str(&batch_id).map_err(|_| "分享批次标识无效".to_string())?;
    Ok(ShareImportEvent {
        batch_id,
        url: value.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const BATCH: &str = "6E2EB4E9-44FD-4CF8-A21A-4D9EE19E8D34";

    #[test]
    fn parses_cold_launch_share_url() {
        let event = parse_share_import_url(&format!(
            "transfergenie://share-import?batch={BATCH}"
        ))
        .unwrap();
        assert_eq!(event.batch_id, BATCH);
    }

    #[test]
    fn parses_warm_delivery_share_url_case_insensitively() {
        let event = parse_share_import_url(&format!(
            "TransferGenie://Share-Import?ignored=1&batch={BATCH}"
        ))
        .unwrap();
        assert_eq!(event.batch_id, BATCH);
    }

    #[test]
    fn rejects_unknown_scheme_and_route() {
        assert!(parse_share_import_url(&format!(
            "https://share-import?batch={BATCH}"
        ))
        .is_err());
        assert!(parse_share_import_url(&format!(
            "transfergenie://settings?batch={BATCH}"
        ))
        .is_err());
    }

    #[test]
    fn rejects_missing_and_malformed_batch_ids() {
        for value in [
            "transfergenie://share-import",
            "transfergenie://share-import?batch=",
            "transfergenie://share-import?batch=not-a-uuid",
            "transfergenie://share-import?batch=../escape",
        ] {
            assert!(parse_share_import_url(value).is_err(), "{value}");
        }
    }
}
