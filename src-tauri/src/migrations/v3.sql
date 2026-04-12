-- Add success column to logs
ALTER TABLE logs ADD COLUMN success INTEGER DEFAULT 1;
