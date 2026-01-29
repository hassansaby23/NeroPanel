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

-- Add category_id to local_content if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='local_content' AND column_name='category_id') THEN
        ALTER TABLE local_content ADD COLUMN category_id VARCHAR(50) DEFAULT '0';
        CREATE INDEX IF NOT EXISTS idx_local_content_category ON local_content(category_id);
    END IF;

    -- Add stream_id to local_content if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='local_content' AND column_name='stream_id') THEN
        ALTER TABLE local_content ADD COLUMN stream_id VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_local_content_stream_id ON local_content(stream_id);
    END IF;

    -- Add category_name to local_content if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='local_content' AND column_name='category_name') THEN
        ALTER TABLE local_content ADD COLUMN category_name VARCHAR(255);
    END IF;
    
    -- Add subtitle_url to local_content if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='local_content' AND column_name='subtitle_url') THEN
        ALTER TABLE local_content ADD COLUMN subtitle_url TEXT;
    END IF;
END $$;

-- Add updated_at to channel_overrides if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='channel_overrides' AND column_name='updated_at') THEN
        ALTER TABLE channel_overrides ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Add updated_at to category_overrides if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='category_overrides' AND column_name='updated_at') THEN
        ALTER TABLE category_overrides ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;
