-- connections definition

CREATE TABLE connections (
	id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	uuid TEXT NOT NULL,
	"url" TEXT NOT NULL
, name TEXT);

CREATE INDEX id_IDX ON connections (id);
CREATE INDEX uuid_IDX ON connections (uuid);