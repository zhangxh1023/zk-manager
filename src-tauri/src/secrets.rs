use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "zk-manager";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSecrets {
  pub password: Option<String>,
  pub ssh_password: Option<String>,
}

fn keyring_entry(connection_uuid: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYRING_SERVICE, connection_uuid)
    .map_err(|error| format!("Failed to open system keychain entry: {error}"))
}

fn is_missing_credential(error: &keyring::Error) -> bool {
  matches!(error, keyring::Error::NoEntry)
}

fn normalize_secret(secret: Option<String>) -> Option<String> {
  secret.filter(|value| !value.is_empty())
}

#[cfg(target_os = "macos")]
fn read_connection_secret_value(connection_uuid: &str) -> Result<Option<String>, String> {
  use security_framework::item::{ItemClass, ItemSearchOptions, SearchResult};

  let results = ItemSearchOptions::new()
    .class(ItemClass::generic_password())
    .service(KEYRING_SERVICE)
    .account(connection_uuid)
    .load_data(true)
    .search()
    .map_err(|error| {
      if error.code() == -25300 {
        return "NO_ENTRY".to_string();
      }
      format!("Failed to read secrets from system keychain: {error}")
    });

  match results {
    Ok(mut results) => match results.pop() {
      Some(SearchResult::Data(bytes)) => String::from_utf8(bytes)
        .map(Some)
        .map_err(|error| format!("Failed to decode connection secrets from keychain: {error}")),
      Some(_) => Err("Unexpected keychain item format for connection secrets".to_string()),
      None => Ok(None),
    },
    Err(error) if error == "NO_ENTRY" => Ok(None),
    Err(error) => Err(error),
  }
}

#[cfg(not(target_os = "macos"))]
fn read_connection_secret_value(connection_uuid: &str) -> Result<Option<String>, String> {
  let entry = keyring_entry(connection_uuid)?;
  match entry.get_password() {
    Ok(secret) => Ok(Some(secret)),
    Err(error) if is_missing_credential(&error) => Ok(None),
    Err(error) => Err(format!(
      "Failed to read secrets from system keychain: {error}"
    )),
  }
}

pub fn set_connection_secrets(
  connection_uuid: &str,
  mut secrets: ConnectionSecrets,
) -> Result<(), String> {
  println!("keychain:set_connection_secrets {}", connection_uuid);
  secrets.password = normalize_secret(secrets.password);
  secrets.ssh_password = normalize_secret(secrets.ssh_password);

  if secrets.password.is_none() && secrets.ssh_password.is_none() {
    return delete_connection_secrets(connection_uuid);
  }

  let entry = keyring_entry(connection_uuid)?;
  let value = serde_json::to_string(&secrets)
    .map_err(|error| format!("Failed to serialize connection secrets: {error}"))?;

  entry
    .set_password(&value)
    .map_err(|error| format!("Failed to save secrets in system keychain: {error}"))
}

pub fn get_connection_secrets(connection_uuid: &str) -> Result<ConnectionSecrets, String> {
  println!("keychain:get_connection_secrets:start {}", connection_uuid);
  match read_connection_secret_value(connection_uuid)? {
    Some(secret) => {
      println!("keychain:get_connection_secrets:found {}", connection_uuid);
      serde_json::from_str(&secret).map_err(|error| {
        format!("Failed to parse connection secrets from system keychain: {error}")
      })
    }
    None => {
      println!(
        "keychain:get_connection_secrets:missing {}",
        connection_uuid
      );
      Ok(ConnectionSecrets::default())
    }
  }
}

pub fn delete_connection_secrets(connection_uuid: &str) -> Result<(), String> {
  println!("keychain:delete_connection_secrets {}", connection_uuid);
  let entry = keyring_entry(connection_uuid)?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(error) if is_missing_credential(&error) => Ok(()),
    Err(error) => Err(format!(
      "Failed to delete secrets from system keychain: {error}"
    )),
  }
}
