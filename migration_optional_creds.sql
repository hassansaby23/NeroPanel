ALTER TABLE upstream_servers ALTER COLUMN username DROP NOT NULL;
ALTER TABLE upstream_servers ALTER COLUMN password_hash DROP NOT NULL;
