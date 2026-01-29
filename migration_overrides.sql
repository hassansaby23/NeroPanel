-- Fix missing tables for overrides
CREATE TABLE IF NOT EXISTS channel_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR(100) UNIQUE NOT NULL, 
    logo_url TEXT,
    custom_name VARCHAR(255),
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id VARCHAR(100) UNIQUE NOT NULL,
    category_name VARCHAR(255), -- Added missing column
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_channel_overrides_stream_id ON channel_overrides(stream_id);
CREATE INDEX IF NOT EXISTS idx_category_overrides_category_id ON category_overrides(category_id);

-- Alter table to add column if table already exists but column missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category_overrides' AND column_name='category_name') THEN
        ALTER TABLE category_overrides ADD COLUMN category_name VARCHAR(255);
    END IF;
END $$;

-- Fix "value too long" for synced_content name
ALTER TABLE synced_content ALTER COLUMN name TYPE TEXT;
