-- Add auth columns to connections (only if they don't exist)
ALTER TABLE connections ADD COLUMN username TEXT;
ALTER TABLE connections ADD COLUMN password TEXT;

-- settings definition
CREATE TABLE IF NOT EXISTS settings (
	key TEXT NOT NULL PRIMARY KEY,
	value TEXT NOT NULL
);

-- logs definition
CREATE TABLE IF NOT EXISTS logs (
	id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	timestamp INTEGER NOT NULL,
	"connectionName" TEXT NOT NULL,
	command TEXT NOT NULL,
	details TEXT
);

CREATE INDEX IF NOT EXISTS logs_timestamp_IDX ON logs (timestamp);