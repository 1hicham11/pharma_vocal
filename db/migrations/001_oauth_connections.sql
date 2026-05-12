-- Connexions OAuth tierces (Google Drive, Microsoft, Notion, Slack, HubSpot, etc.)
-- Exécuter une fois sur la base utilisée par l'app (même DB que utilisateurs).

CREATE TABLE IF NOT EXISTS oauth_connections (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at DATETIME NULL,
  token_type VARCHAR(64) NULL,
  scope TEXT NULL,
  extra JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_oauth_user_provider (user_id, provider),
  KEY idx_oauth_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
