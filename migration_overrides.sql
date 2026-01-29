-- Fix missing tables for overrides
CREATE TABLE IF NOT EXISTS channel_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR(100) UNIQUE NOT NULL, -- Changed to VARCHAR to be safe, code converts to Number but DB can store as string
    logo_url TEXT,
    custom_name VARCHAR(255),
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id VARCHAR(100) UNIQUE NOT NULL,
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_channel_overrides_stream_id ON channel_overrides(stream_id);
CREATE INDEX IF NOT EXISTS idx_category_overrides_category_id ON category_overrides(category_id);
