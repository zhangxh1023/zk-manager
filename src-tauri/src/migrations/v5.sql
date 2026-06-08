-- Add manual ordering for connections
ALTER TABLE connections ADD COLUMN sort_order INTEGER;
UPDATE connections SET sort_order = id WHERE sort_order IS NULL;
CREATE INDEX IF NOT EXISTS connections_sort_order_IDX ON connections (sort_order);
