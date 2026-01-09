use crate::types::{DavEntry, Settings};
use percent_encoding::percent_decode_str;
use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::{Client, Method, RequestBuilder};
use url::Url;

fn apply_auth(request: RequestBuilder, settings: &Settings) -> RequestBuilder {
  if settings.username.is_empty() && settings.password.is_empty() {
    request
  } else {
    request.basic_auth(settings.username.clone(), Some(settings.password.clone()))
  }
}

fn base_url(settings: &Settings) -> Result<Url, String> {
  let mut raw = settings.webdav_url.trim().to_string();
  if raw.is_empty() {
    return Err("WebDAV 地址为空".to_string());
  }
  if !raw.ends_with('/') {
    raw.push('/');
  }
  Url::parse(&raw).map_err(|err| format!("WebDAV 地址无效: {err}"))
}

fn extract_filename(href: &str) -> String {
  let trimmed = href.trim();
  let without_query = trimmed.split('?').next().unwrap_or(trimmed);
  let decoded = percent_decode_str(without_query)
    .decode_utf8_lossy()
    .to_string();
  let no_trailing = decoded.trim_end_matches('/');
  no_trailing
    .split('/')
    .last()
    .unwrap_or("")
    .to_string()
}

pub async fn list_entries(
  client: &Client,
  settings: &Settings,
  prefix: Option<&str>,
  allow_missing: bool,
) -> Result<Vec<DavEntry>, String> {
  let mut url = base_url(settings)?;
  let prefix_trim = prefix.unwrap_or("").trim_matches('/');
  if !prefix_trim.is_empty() {
    let target = format!("{}/", prefix_trim);
    url = url
      .join(&target)
      .map_err(|err| format!("WebDAV 路径无效: {err}"))?;
  }
  let body = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getcontentlength />
    <d:getlastmodified />
    <d:getetag />
    <d:resourcetype />
  </d:prop>
</d:propfind>"#;

  let request = client
    .request(Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?, url)
    .header("Depth", "1")
    .header("Content-Type", "application/xml")
    .body(body.to_string());

  let response = apply_auth(request, settings)
    .send()
    .await
    .map_err(|err| format!("WebDAV 请求失败: {err}"))?;

  let status = response.status();
  if !status.is_success() {
    if allow_missing && status.as_u16() == 404 {
      return Ok(Vec::new());
    }
    return Err(format!("WebDAV 列表失败: HTTP {}", status));
  }

  let text = response
    .text()
    .await
    .map_err(|err| format!("读取 WebDAV 响应失败: {err}"))?;

  let mut reader = Reader::from_str(&text);
  reader.trim_text(true);
  let mut entries = Vec::new();
  let mut current: Option<DavEntry> = None;
  let mut current_tag: Option<Vec<u8>> = None;

  loop {
    match reader.read_event() {
      Ok(Event::Start(ref e)) => {
        let name = e.name().as_ref().to_vec();
        match name.as_slice() {
          b"response" => {
            current = Some(DavEntry {
              filename: String::new(),
              remote_path: String::new(),
              href: String::new(),
              etag: None,
              size: None,
              mtime: None,
              is_collection: false,
            });
          }
          b"href" | b"getetag" | b"getcontentlength" | b"getlastmodified" => {
            current_tag = Some(name);
          }
          b"collection" => {
            if let Some(entry) = current.as_mut() {
              entry.is_collection = true;
            }
          }
          _ => {}
        }
      }
      Ok(Event::Empty(ref e)) => {
        if e.name().as_ref() == b"collection" {
          if let Some(entry) = current.as_mut() {
            entry.is_collection = true;
          }
        }
      }
      Ok(Event::Text(e)) => {
        if let Some(tag) = current_tag.as_ref() {
          let value = e.unescape().unwrap_or_default().to_string();
          if let Some(entry) = current.as_mut() {
            match tag.as_slice() {
              b"href" => {
                entry.href = value.clone();
                entry.filename = extract_filename(&value);
                entry.remote_path = if prefix_trim.is_empty() {
                  entry.filename.clone()
                } else {
                  format!("{}/{}", prefix_trim, entry.filename)
                };
                if value.ends_with('/') {
                  entry.is_collection = true;
                }
              }
              b"getetag" => entry.etag = Some(value),
              b"getcontentlength" => entry.size = value.parse::<u64>().ok(),
              b"getlastmodified" => entry.mtime = Some(value),
              _ => {}
            }
          }
        }
      }
      Ok(Event::End(ref e)) => {
        let name = e.name().as_ref().to_vec();
        if name.as_slice() == b"response" {
          if let Some(entry) = current.take() {
            if !entry.filename.is_empty() {
              entries.push(entry);
            }
          }
        }
        if let Some(tag) = current_tag.as_ref() {
          if tag.as_slice() == name.as_slice() {
            current_tag = None;
          }
        }
      }
      Ok(Event::Eof) => break,
      Err(err) => return Err(format!("解析 WebDAV 响应失败: {err}")),
      _ => {}
    }
  }

  Ok(entries)
}

pub async fn download_file(
  client: &Client,
  settings: &Settings,
  remote_path: &str,
) -> Result<Vec<u8>, String> {
  let mut url = base_url(settings)?;
  url = url
    .join(remote_path)
    .map_err(|err| format!("文件地址无效: {err}"))?;

  let request = client.get(url);
  let response = apply_auth(request, settings)
    .send()
    .await
    .map_err(|err| format!("下载失败: {err}"))?;

  let status = response.status();
  if !status.is_success() {
    return Err(format!("下载失败: HTTP {}", status));
  }

  response
    .bytes()
    .await
    .map(|bytes| bytes.to_vec())
    .map_err(|err| format!("读取下载内容失败: {err}"))
}

pub async fn upload_file(
  client: &Client,
  settings: &Settings,
  remote_path: &str,
  data: Vec<u8>,
) -> Result<(), String> {
  let mut url = base_url(settings)?;
  url = url
    .join(remote_path)
    .map_err(|err| format!("上传地址无效: {err}"))?;

  let request = client.put(url).body(data);
  let response = apply_auth(request, settings)
    .send()
    .await
    .map_err(|err| format!("上传失败: {err}"))?;

  let status = response.status();
  if !status.is_success() {
    return Err(format!("上传失败: HTTP {}", status));
  }
  Ok(())
}

pub async fn ensure_directory(
  client: &Client,
  settings: &Settings,
  remote_path: &str,
) -> Result<(), String> {
  let mut url = base_url(settings)?;
  let target = format!("{}/", remote_path.trim_matches('/'));
  url = url
    .join(&target)
    .map_err(|err| format!("目录地址无效: {err}"))?;

  let request = client.request(Method::from_bytes(b"MKCOL").map_err(|e| e.to_string())?, url);
  let response = apply_auth(request, settings)
    .send()
    .await
    .map_err(|err| format!("创建目录失败: {err}"))?;

  let status = response.status();
  if status.is_success() || status.as_u16() == 405 {
    return Ok(());
  }
  Err(format!("创建目录失败: HTTP {}", status))
}
