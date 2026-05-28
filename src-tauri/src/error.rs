use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppError {
  pub(crate) code: String,
  pub(crate) message: String,
  pub(crate) detail: Option<String>,
}

pub(crate) type AppResult<T> = Result<T, AppError>;

impl AppError {
  pub(crate) fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
    AppError {
      code: code.into(),
      message: message.into(),
      detail: None,
    }
  }

  pub(crate) fn with_detail(
    code: impl Into<String>,
    message: impl Into<String>,
    detail: impl Into<String>,
  ) -> Self {
    AppError {
      code: code.into(),
      message: message.into(),
      detail: Some(detail.into()),
    }
  }
}

pub(crate) fn internal_error(message: &str) -> AppError {
  AppError::new("INTERNAL", message)
}

pub(crate) fn zk_error(error: impl std::fmt::Debug, fallback_message: &str) -> AppError {
  let detail = format!("{:?}", error);
  let (code, message) = if detail.contains("NoNode") {
    ("NO_NODE", "Node does not exist")
  } else if detail.contains("NodeExists") {
    ("NODE_EXISTS", "Node already exists")
  } else if detail.contains("NotEmpty") {
    ("NOT_EMPTY", "Cannot delete node with children")
  } else if detail.contains("BadVersion") {
    (
      "VERSION_CONFLICT",
      "Node was changed by another operation. Refresh and try again.",
    )
  } else if detail.contains("NoAuth") || detail.contains("AuthFailed") {
    ("AUTH_FAILED", "Authentication failed or permission denied")
  } else if detail.contains("ConnectionLoss") || detail.contains("SessionExpired") {
    ("CONNECTION_LOST", "ZooKeeper connection is not available")
  } else {
    ("ZK_ERROR", fallback_message)
  };

  AppError::with_detail(code, message, detail)
}

pub(crate) fn keychain_error(error: impl ToString) -> AppError {
  AppError::with_detail(
    "KEYCHAIN_ERROR",
    "Failed to access system keychain",
    error.to_string(),
  )
}

pub(crate) fn ssh_tunnel_error(error: String) -> AppError {
  if error.starts_with("SSH host key is not trusted.") {
    AppError::with_detail(
      "SSH_HOST_KEY_UNTRUSTED",
      "SSH host key is not trusted",
      error,
    )
  } else if error.starts_with("SSH host key changed") {
    AppError::with_detail("SSH_HOST_KEY_CHANGED", "SSH host key changed", error)
  } else {
    AppError::with_detail("SSH_TUNNEL_ERROR", "SSH tunnel failed", error)
  }
}
