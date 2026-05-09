const KEYRING_SERVICE: &str = "zk-manager";
const CONNECTION_SECRET_KEYS: [&str; 2] = ["password", "ssh_password"];

fn validate_secret_key(secret_key: &str) -> Result<(), String> {
  if CONNECTION_SECRET_KEYS.contains(&secret_key) {
    Ok(())
  } else {
    Err(format!("Unsupported secret key: {secret_key}"))
  }
}

fn keyring_entry(connection_uuid: &str, secret_key: &str) -> Result<keyring::Entry, String> {
  validate_secret_key(secret_key)?;
  let username = format!("{connection_uuid}:{secret_key}");
  keyring::Entry::new(KEYRING_SERVICE, &username)
    .map_err(|error| format!("Failed to open system keychain entry: {error}"))
}

fn is_missing_credential(error: &keyring::Error) -> bool {
  matches!(error, keyring::Error::NoEntry)
}

pub fn set_connection_secret(
  connection_uuid: &str,
  secret_key: &str,
  secret: Option<String>,
) -> Result<(), String> {
  let entry = keyring_entry(connection_uuid, secret_key)?;
  match secret {
    Some(value) if !value.is_empty() => entry
      .set_password(&value)
      .map_err(|error| format!("Failed to save secret in system keychain: {error}")),
    _ => delete_connection_secret(connection_uuid, secret_key),
  }
}

pub fn get_connection_secret(
  connection_uuid: &str,
  secret_key: &str,
) -> Result<Option<String>, String> {
  let entry = keyring_entry(connection_uuid, secret_key)?;
  match entry.get_password() {
    Ok(secret) => Ok(Some(secret)),
    Err(error) if is_missing_credential(&error) => Ok(None),
    Err(error) => Err(format!(
      "Failed to read secret from system keychain: {error}"
    )),
  }
}

pub fn delete_connection_secret(connection_uuid: &str, secret_key: &str) -> Result<(), String> {
  let entry = keyring_entry(connection_uuid, secret_key)?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(error) if is_missing_credential(&error) => Ok(()),
    Err(error) => Err(format!(
      "Failed to delete secret from system keychain: {error}"
    )),
  }
}

pub fn delete_connection_secrets(connection_uuid: &str) -> Result<(), String> {
  for secret_key in CONNECTION_SECRET_KEYS {
    delete_connection_secret(connection_uuid, secret_key)?;
  }
  Ok(())
}
