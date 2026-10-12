use crate::supabase_auth::SupabaseSession;

#[cfg(test)]
use std::sync::{Mutex, MutexGuard, OnceLock};

#[cfg(test)]
static CREDENTIAL_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn credential_test_guard() -> MutexGuard<'static, ()> {
    CREDENTIAL_TEST_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

const SERVICE: &str = "transfer-genie";

fn account(profile_id: &str) -> String {
    format!("supabase:{}", profile_id.trim())
}

pub fn save_session(profile_id: &str, session: &SupabaseSession) -> Result<(), String> {
    let value = serde_json::to_string(session).map_err(|err| format!("序列化会话失败: {err}"))?;
    keyring::Entry::new(SERVICE, &account(profile_id))
        .map_err(|err| format!("打开系统凭据库失败: {err}"))?
        .set_password(&value)
        .map_err(|err| format!("保存系统凭据失败: {err}"))
}

pub fn load_session(profile_id: &str) -> Result<Option<SupabaseSession>, String> {
    let entry = keyring::Entry::new(SERVICE, &account(profile_id))
        .map_err(|err| format!("打开系统凭据库失败: {err}"))?;
    match entry.get_password() {
        Ok(value) => serde_json::from_str(&value)
            .map(Some)
            .map_err(|err| format!("读取到的系统凭据无效: {err}")),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("读取系统凭据失败: {err}")),
    }
}

pub fn delete_session(profile_id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &account(profile_id))
        .map_err(|err| format!("打开系统凭据库失败: {err}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("删除系统凭据失败: {err}")),
    }
}

pub fn restore_sessions(
    profile_ids: impl IntoIterator<Item = String>,
) -> std::collections::HashMap<String, SupabaseSession> {
    profile_ids
        .into_iter()
        .filter_map(|profile_id| match load_session(&profile_id) {
            Ok(Some(session)) => Some((profile_id, session)),
            Ok(None) => None,
            Err(err) => {
                log::warn!("Supabase session restore failed for profile: {err}");
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_round_trip_preserves_session_without_password_field() {
        let _guard = credential_test_guard();
        let profile_id = format!("credential-test-{}", rand::random::<u64>());
        let session = SupabaseSession {
            access_token: "access-token".into(),
            refresh_token: "refresh-token".into(),
            user_id: "user-id".into(),
            email: "user@example.com".into(),
            expires_at: 1234,
        };
        save_session(&profile_id, &session).expect("save credential");
        let restored = load_session(&profile_id)
            .expect("load credential")
            .expect("stored credential");
        assert_eq!(restored.access_token, session.access_token);
        assert_eq!(restored.refresh_token, session.refresh_token);
        let serialized = serde_json::to_string(&restored).expect("serialize session");
        assert!(!serialized.contains("password"));
        delete_session(&profile_id).expect("delete credential");
        assert!(load_session(&profile_id)
            .expect("load deleted credential")
            .is_none());
    }
}
