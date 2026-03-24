use crate::types::{DavEntry, WebDavEndpoint};
use bytes::Bytes;
use log::info;
use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::header::{
    CONTENT_LENGTH, CONTENT_RANGE, ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED, RANGE,
};
use reqwest::{Body, Client, Method, RequestBuilder};
use std::pin::Pin;
use std::time::Duration;
use url::Url;

pub struct DownloadStreamResponse {
    pub stream: Pin<Box<dyn futures_util::Stream<Item = reqwest::Result<Bytes>> + Send>>,
    pub content_length: Option<u64>,
    pub total_size: Option<u64>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub status_code: u16,
}

pub enum ConditionalFileStatus {
    Modified(Vec<u8>),
    NotModified,
    Missing,
}

pub struct ConditionalFileResponse {
    pub status: ConditionalFileStatus,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

fn apply_auth(request: RequestBuilder, endpoint: &WebDavEndpoint) -> RequestBuilder {
    apply_auth_with_timeout(request, endpoint, Some(Duration::from_secs(30)))
}

fn apply_auth_without_timeout(
    request: RequestBuilder,
    endpoint: &WebDavEndpoint,
) -> RequestBuilder {
    apply_auth_with_timeout(request, endpoint, None)
}

fn apply_auth_with_timeout(
    request: RequestBuilder,
    endpoint: &WebDavEndpoint,
    timeout: Option<Duration>,
) -> RequestBuilder {
    let request = match timeout {
        Some(timeout) => request.timeout(timeout),
        None => request,
    };
    if endpoint.username.is_empty() && endpoint.password.is_empty() {
        request
    } else {
        request.basic_auth(endpoint.username.clone(), Some(endpoint.password.clone()))
    }
}

fn base_url(endpoint: &WebDavEndpoint) -> Result<Url, String> {
    let mut raw = endpoint.url.trim().to_string();
    if raw.is_empty() {
        return Err("WebDAV 地址为空".to_string());
    }
    if !raw.ends_with('/') {
        raw.push('/');
    }
    Url::parse(&raw).map_err(|err| format!("WebDAV 地址无效: {err}"))
}

fn parse_content_range_total(value: Option<&str>) -> Option<u64> {
    let value = value?;
    let total = value.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<u64>().ok()
}

pub async fn list_entries(
    client: &Client,
    endpoint: &WebDavEndpoint,
    prefix: Option<&str>,
    allow_missing: bool,
) -> Result<Vec<DavEntry>, String> {
    let mut url = base_url(endpoint)?;
    let prefix_trim = prefix.unwrap_or("").trim_matches('/');
    if !prefix_trim.is_empty() {
        let target = format!("{}/", prefix_trim);
        url = url
            .join(&target)
            .map_err(|err| format!("WebDAV 路径无效: {err}"))?;
    }

    let body = r###"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:getetag/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"###;

    let request = client
        .request(
            Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?,
            url.clone(),
        )
        .header("Depth", "1")
        .header("Content-Type", "application/xml")
        .body(body.to_string());

    info!("Sending PROPFIND request to: {}", url);

    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("WebDAV 请求失败: {err}"))?;

    let status = response.status();
    info!("Received response with status: {}", status);

    let text = response
        .text()
        .await
        .map_err(|err| format!("读取 WebDAV 响应失败: {err}"))?;

    // info!("Received response body:\n---\n{}\n---", &text);

    if !(status.is_success() || status.as_u16() == 206) {
        if allow_missing && status.as_u16() == 404 {
            return Ok(Vec::new());
        }
        return Err(format!("WebDAV 列表失败: HTTP {}", status));
    }

    let entries = parse_propfind_response(&text, endpoint)?;

    // info!("Entries: {:#?}", entries);

    let request_path = prefix.unwrap_or("").trim_matches('/');
    Ok(entries
        .into_iter()
        .filter(|entry| {
            let is_self = entry.remote_path.trim_matches('/') == request_path;
            // The python script also checks for empty name from href.
            let is_empty = entry.filename.is_empty();
            !is_self && !is_empty
        })
        .collect())
}

fn parse_propfind_response(
    xml_text: &str,
    endpoint: &WebDavEndpoint,
) -> Result<Vec<DavEntry>, String> {
    let mut reader = Reader::from_str(xml_text);
    reader.trim_text(true);
    let mut entries = Vec::new();
    let mut buffer = Vec::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(event) => {
                if let Event::Start(ref e) = event {
                    let name = e.name();
                    // Check if the tag name ends with "response" (ignoring namespace prefix)
                    if name.as_ref().ends_with(b"response") {
                        if let Some(entry) = parse_response_entry(&mut reader, endpoint)? {
                            entries.push(entry);
                        }
                    }
                } else if let Event::Eof = event {
                    break;
                }
            }
            Err(e) => return Err(format!("XML (outer) aken解析错误: {}", e)),
        }
        buffer.clear();
    }
    info!("Total parsed entries: {}", entries.len());
    Ok(entries)
}

fn parse_response_entry(
    reader: &mut Reader<&[u8]>,
    endpoint: &WebDavEndpoint,
) -> Result<Option<DavEntry>, String> {
    let mut entry = DavEntry::default();
    let mut buffer = Vec::new();
    let mut prop_name = String::new();
    let mut in_propstat = false;
    let mut level = 1;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) => {
                level += 1;
                // Convert tag name to string for easier suffix checking
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();

                // Store the tag name to process text content later
                // We use a simplified name (suffix) for matching properties
                if tag_name.ends_with("propstat") {
                    in_propstat = true;
                } else if tag_name.ends_with("collection") {
                    entry.is_collection = true;
                } else {
                    // For other properties, we keep the full name but will match suffix in Text event
                    prop_name = tag_name;
                }
            }
            Ok(Event::Empty(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                if tag_name.ends_with("collection") {
                    entry.is_collection = true;
                }
            }
            Ok(Event::Text(e)) => {
                let value = e.unescape().unwrap_or_default().to_string();
                if prop_name.ends_with("href") {
                    entry.href = value;
                } else if in_propstat {
                    if prop_name.ends_with("getcontentlength") {
                        entry.size = value.parse().ok();
                    } else if prop_name.ends_with("getlastmodified") {
                        entry.mtime = Some(value);
                    } else if prop_name.ends_with("getetag") {
                        entry.etag = Some(value.trim_matches('"').to_string());
                    }
                }
            }
            Ok(Event::End(e)) => {
                level -= 1;
                let tag_name = e.name();
                if tag_name.as_ref().ends_with(b"response") || level == 0 {
                    break;
                }
                if tag_name.as_ref().ends_with(b"propstat") {
                    in_propstat = false;
                }
            }
            Err(e) => return Err(format!("XML (response) aken解析错误: {}", e)),
            Ok(Event::Eof) => break,
            _ => {}
        }
        buffer.clear();
    }

    finalize_entry(&mut entry, endpoint)?;
    if entry.filename.is_empty() {
        return Ok(None);
    }
    Ok(Some(entry))
}

fn finalize_entry(entry: &mut DavEntry, endpoint: &WebDavEndpoint) -> Result<(), String> {
    if entry.href.is_empty() {
        return Ok(());
    }

    let base = base_url(endpoint)?;
    // Keep base path and href encoded for consistent filename handling
    let base_path_encoded = base.path().to_string();
    let href_encoded = entry.href.clone();

    // Extract the path part if href is a full URL, otherwise use it as is (absolute path)
    let href_path = if let Ok(href_url) = Url::parse(&entry.href) {
        href_url.path().to_string()
    } else {
        href_encoded
    };

    // Calculate the relative path by removing the base path prefix
    if href_path.starts_with(&base_path_encoded) {
        entry.remote_path = href_path[base_path_encoded.len()..]
            .trim_matches('/')
            .to_string();
    } else {
        // Fallback: if it's not under base_path, just use the trimmed absolute path
        entry.remote_path = href_path.trim_matches('/').to_string();
    }

    // Extract filename from the path (it will remain encoded)
    entry.filename = href_path
        .trim_end_matches('/')
        .split('/')
        .last()
        .unwrap_or("")
        .to_string();

    Ok(())
}

pub async fn download_file(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
) -> Result<Vec<u8>, String> {
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("文件地址无效: {err}"))?;

    log::info!("Downloading file from: {}", url);

    let request = client.get(url.clone());
    // log::info!("Request: {:?}", request);
    let response = apply_auth_without_timeout(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("下载失败: {err}"))?;

    let status = response.status();
    if !(status.is_success() || status.as_u16() == 206) {
        info!("Failed to download '{}'. HTTP Status: {}", url, status);
        return Err(format!("下载失败: HTTP {}", status));
    }

    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|err| format!("读取下载内容失败: {err}"))
}

pub async fn download_file_stream(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
) -> Result<DownloadStreamResponse, String> {
    download_file_stream_with_range(client, endpoint, remote_path, None).await
}

pub async fn download_file_stream_with_range(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
    range_start: Option<u64>,
) -> Result<DownloadStreamResponse, String> {
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("文件地址无效: {err}"))?;

    let request = if let Some(range_start) = range_start {
        client
            .get(url)
            .header(RANGE, format!("bytes={range_start}-"))
    } else {
        client.get(url)
    };
    let response = apply_auth_without_timeout(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("下载失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("下载失败: HTTP {}", status));
    }
    let content_length = response.content_length();
    let headers = response.headers();
    let total_size = if status.as_u16() == 206 {
        parse_content_range_total(
            headers
                .get(CONTENT_RANGE)
                .and_then(|value| value.to_str().ok()),
        )
    } else {
        content_length
    };
    let etag = headers
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim_matches('"').to_string());
    let last_modified = headers
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    Ok(DownloadStreamResponse {
        stream: Box::pin(response.bytes_stream()),
        content_length,
        total_size,
        etag,
        last_modified,
        status_code: status.as_u16(),
    })
}

pub async fn upload_file_stream<S, E>(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
    stream: S,
    content_length: u64,
) -> Result<(), String>
where
    S: futures_util::Stream<Item = Result<Bytes, E>> + Send + Sync + 'static,
    E: Into<Box<dyn std::error::Error + Send + Sync>>,
{
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("上传地址无效: {err}"))?;

    // Explicitly set Content-Length to avoid "411 Length Required"
    let body = Body::wrap_stream(stream);
    let request = client
        .put(url)
        .header("Content-Length", content_length.to_string())
        .body(body);

    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("上传失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("上传失败: HTTP {}", status));
    }
    Ok(())
}

pub async fn download_optional_file(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
) -> Result<Option<Vec<u8>>, String> {
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("文件地址无效: {err}"))?;

    let request = client.get(url);
    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("下载失败: {err}"))?;

    let status = response.status();
    if status.as_u16() == 404 {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!("下载失败: HTTP {}", status));
    }

    response
        .bytes()
        .await
        .map(|bytes| Some(bytes.to_vec()))
        .map_err(|err| format!("读取下载内容失败: {err}"))
}

pub async fn download_optional_file_conditional(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> Result<ConditionalFileResponse, String> {
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("鏂囦欢鍦板潃鏃犳晥: {err}"))?;

    let mut request = client.get(url);
    if let Some(etag) = etag.filter(|value| !value.trim().is_empty()) {
        request = request.header(IF_NONE_MATCH, etag);
    }
    if let Some(last_modified) = last_modified.filter(|value| !value.trim().is_empty()) {
        request = request.header(IF_MODIFIED_SINCE, last_modified);
    }

    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("涓嬭浇澶辫触: {err}"))?;

    let headers = response.headers().clone();
    let etag = headers
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim_matches('"').to_string());
    let last_modified = headers
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let status = response.status();

    if status.as_u16() == 304 {
        return Ok(ConditionalFileResponse {
            status: ConditionalFileStatus::NotModified,
            etag,
            last_modified,
        });
    }
    if status.as_u16() == 404 {
        return Ok(ConditionalFileResponse {
            status: ConditionalFileStatus::Missing,
            etag,
            last_modified,
        });
    }
    if !status.is_success() {
        return Err(format!("涓嬭浇澶辫触: HTTP {}", status));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("璇诲彇涓嬭浇鍐呭澶辫触: {err}"))?;
    Ok(ConditionalFileResponse {
        status: ConditionalFileStatus::Modified(bytes.to_vec()),
        etag,
        last_modified,
    })
}

pub async fn upload_file(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("上传地址无效: {err}"))?;

    let request = client.put(url).body(data);
    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("上传失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("上传失败: HTTP {}", status));
    }
    Ok(())
}

pub async fn upload_file_with_progress<F>(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
    data: Vec<u8>,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, u64) + Send + 'static,
{
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("上传地址无效: {err}"))?;

    let data = Bytes::from(data);
    let total = data.len() as u64;
    let chunk_size = 512 * 1024;
    on_progress(0, total);

    let stream = futures_util::stream::unfold((data, 0usize, on_progress), move |state| async move {
        let (data, offset, mut on_progress) = state;
        if offset >= data.len() {
            return None;
        }
        let end = (offset + chunk_size).min(data.len());
        let chunk = data.slice(offset..end);
        on_progress(end as u64, total);
        Some((Ok::<Bytes, std::io::Error>(chunk), (data, end, on_progress)))
    });

    let body = Body::wrap_stream(stream);
    let request = client
        .put(url)
        .header(CONTENT_LENGTH, total.to_string())
        .body(body);
    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("上传失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("上传失败: HTTP {}", status));
    }
    Ok(())
}

pub async fn delete_file(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
    allow_missing: bool,
) -> Result<(), String> {
    let mut url = base_url(endpoint)?;
    url = url
        .join(remote_path)
        .map_err(|err| format!("删除地址无效: {err}"))?;

    let request = client.request(
        Method::from_bytes(b"DELETE").map_err(|e| e.to_string())?,
        url,
    );
    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("删除失败: {err}"))?;

    let status = response.status();
    if status.is_success() || (allow_missing && status.as_u16() == 404) {
        return Ok(());
    }
    Err(format!("删除失败: HTTP {}", status))
}

pub async fn ensure_directory(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
) -> Result<(), String> {
    let mut url = base_url(endpoint)?;
    let target = format!("{}/", remote_path.trim_matches('/'));
    url = url
        .join(&target)
        .map_err(|err| format!("目录地址无效: {err}"))?;

    let request = client.request(
        Method::from_bytes(b"MKCOL").map_err(|e| e.to_string())?,
        url,
    );
    let response = apply_auth(request, endpoint)
        .send()
        .await
        .map_err(|err| format!("创建目录失败: {err}"))?;

    let status = response.status();
    if status.is_success() || status.as_u16() == 405 {
        return Ok(());
    }
    Err(format!("创建目录失败: HTTP {}", status))
}

pub async fn ensure_parent_directories(
    client: &Client,
    endpoint: &WebDavEndpoint,
    remote_path: &str,
) -> Result<(), String> {
    let parts: Vec<&str> = remote_path
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() <= 1 {
        return Ok(());
    }

    let mut current = String::new();
    for part in &parts[..parts.len() - 1] {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(part);
        ensure_directory(client, endpoint, &current).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::WebDavEndpoint;

    #[test]
    fn test_parse_propfind_response() {
        let xml = r###"<?xml version="1.0" encoding="utf-8" ?>
<ns0:multistatus xmlns:ns0="DAV:"><ns0:response><ns0:href>/seafdav/%E7%A7%81%E4%BA%BA%E8%B5%84%E6%96%99%E5%BA%93/%E6%95%B0%E6%8D%AE/TransferGenie/</ns0:href><ns0:propstat><ns0:prop><ns0:displayname>TransferGenie</ns0:displayname><ns0:getetag>f90b8a863685b11979deba098fc8e9582dd448a5</ns0:getetag><ns0:resourcetype><ns0:collection /></ns0:resourcetype></ns0:prop><ns0:status>HTTP/1.1 200 OK</ns0:status></ns0:propstat><ns0:propstat><ns0:prop><ns0:getcontentlength /><ns0:getlastmodified /></ns0:prop><ns0:status>HTTP/1.1 404 Not Found</ns0:status></ns0:propstat></ns0:response><ns0:response><ns0:href>/seafdav/%E7%A7%81%E4%BA%BA%E8%B5%84%E6%96%99%E5%BA%93/%E6%95%B0%E6%8D%AE/TransferGenie/history.json</ns0:href><ns0:propstat><ns0:prop><ns0:displayname>history.json</ns0:displayname><ns0:getcontentlength>3912</ns0:getcontentlength><ns0:getlastmodified>Thu, 15 Jan 2026 09:03:20 GMT</ns0:getlastmodified><ns0:getetag>ba0554fcae0a8912137222b5d1f200446c56746a</ns0:getetag><ns0:resourcetype /></ns0:prop><ns0:status>HTTP/1.1 200 OK</ns0:status></ns0:propstat></ns0:response><ns0:response><ns0:href>/seafdav/%E7%A7%81%E4%BA%BA%E8%B5%84%E6%96%99%E5%BA%93/%E6%95%B0%E6%8D%AE/TransferGenie/files/</ns0:href><ns0:propstat><ns0:prop><ns0:displayname>files</ns0:displayname><ns0:getetag>c94810a05b4ac2ccec31b506d56c3d514314a672</ns0:getetag><ns0:resourcetype><ns0:collection /></ns0:resourcetype></ns0:prop><ns0:status>HTTP/1.1 200 OK</ns0:status></ns0:propstat><ns0:propstat><ns0:prop><ns0:getcontentlength /><ns0:getlastmodified /></ns0:prop><ns0:status>HTTP/1.1 404 Not Found</ns0:status></ns0:propstat></ns0:response></ns0:multistatus>"###;

        let endpoint = WebDavEndpoint {
            id: "test".to_string(),
            name: "test".to_string(),
            url: "http://example.com/seafdav/".to_string(),
            username: "user".to_string(),
            password: "pass".to_string(),
            enabled: true,
        };

        let entries = parse_propfind_response(xml, &endpoint).expect("Parsing failed");

        // We expect 3 entries: TransferGenie (dir), history.json (file), files (dir)
        assert_eq!(entries.len(), 3);

        // Check 1st entry
        let e1 = &entries[0];
        assert_eq!(e1.filename, "TransferGenie");
        assert!(e1.is_collection);

        // Check 2nd entry
        let e2 = &entries[1];
        assert_eq!(e2.filename, "history.json");
        assert!(!e2.is_collection);
        assert_eq!(e2.size, Some(3912));

        // Check 3rd entry
        let e3 = &entries[2];
        assert_eq!(e3.filename, "files");
        assert!(e3.is_collection);
    }
}
