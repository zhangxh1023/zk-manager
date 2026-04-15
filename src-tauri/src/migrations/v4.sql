-- Add SSH tunnel configuration to connections
ALTER TABLE connections ADD COLUMN use_ssh INTEGER DEFAULT 0;
ALTER TABLE connections ADD COLUMN ssh_host TEXT;
ALTER TABLE connections ADD COLUMN ssh_port INTEGER DEFAULT 22;
ALTER TABLE connections ADD COLUMN ssh_username TEXT;
ALTER TABLE connections ADD COLUMN ssh_auth_method TEXT DEFAULT 'password';
ALTER TABLE connections ADD COLUMN ssh_password TEXT;
ALTER TABLE connections ADD COLUMN ssh_key_path TEXT;
