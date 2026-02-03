-- create table
CREATE TABLE IF NOT EXISTS upstream_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_url VARCHAR(500) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    timeout_seconds INTEGER DEFAULT 30 CHECK (timeout_seconds >= 5 AND timeout_seconds <= 300),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_upstream_servers_active ON upstream_servers(is_active);
CREATE INDEX IF NOT EXISTS idx_upstream_servers_last_sync ON upstream_servers(last_sync_at);

-- create table
CREATE TABLE IF NOT EXISTS synced_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upstream_server_id UUID REFERENCES upstream_servers(id) ON DELETE CASCADE,
    stream_id VARCHAR(100) NOT NULL,
    name TEXT NOT NULL,
    stream_type VARCHAR(20) CHECK (stream_type IN ('live', 'vod', 'series')),
    stream_icon TEXT,
    stream_url TEXT,
    metadata JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(upstream_server_id, stream_id)
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_synced_content_server ON synced_content(upstream_server_id);
CREATE INDEX IF NOT EXISTS idx_synced_content_type ON synced_content(stream_type);
CREATE INDEX IF NOT EXISTS idx_synced_content_name ON synced_content(name);
CREATE INDEX IF NOT EXISTS idx_synced_content_synced_at ON synced_content(synced_at DESC);

-- create table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- create table
CREATE TABLE IF NOT EXISTS local_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_type VARCHAR(20) CHECK (content_type IN ('movie', 'series')),
    poster_url TEXT,
    stream_url TEXT NOT NULL,
    metadata JSONB,
    category_id VARCHAR(50) DEFAULT '0',
    category_name VARCHAR(255),
    stream_id VARCHAR(100),
    subtitle_url TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_local_content_type ON local_content(content_type);
CREATE INDEX IF NOT EXISTS idx_local_content_category ON local_content(category_id);
CREATE INDEX IF NOT EXISTS idx_local_content_stream_id ON local_content(stream_id);
CREATE INDEX IF NOT EXISTS idx_local_content_created_at ON local_content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_content_created_by ON local_content(created_by);

-- create table
CREATE TABLE IF NOT EXISTS local_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id UUID REFERENCES local_content(id) ON DELETE CASCADE,
    season_num INTEGER NOT NULL,
    episode_num INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    stream_url TEXT NOT NULL,
    stream_id VARCHAR(100) UNIQUE NOT NULL,
    container_extension VARCHAR(10) DEFAULT 'mp4',
    duration VARCHAR(20) DEFAULT '00:00:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_local_episodes_series ON local_episodes(series_id);
CREATE INDEX IF NOT EXISTS idx_local_episodes_stream_id ON local_episodes(stream_id);

-- create table
CREATE TABLE IF NOT EXISTS content_routing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id VARCHAR(100) NOT NULL,
    content_source VARCHAR(20) CHECK (content_source IN ('upstream', 'local')),
    routing_type VARCHAR(20) CHECK (routing_type IN ('proxy', 'redirect', 'direct')),
    priority INTEGER DEFAULT 100 CHECK (priority >= 0 AND priority <= 1000),
    routing_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_routing_content ON content_routing(content_id, content_source);
CREATE INDEX IF NOT EXISTS idx_routing_priority ON content_routing(priority DESC);

-- create table
CREATE TABLE IF NOT EXISTS channel_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    custom_name VARCHAR(255),
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_channel_overrides_stream_id ON channel_overrides(stream_id);

-- create table
CREATE TABLE IF NOT EXISTS category_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id VARCHAR(100) UNIQUE NOT NULL,
    category_name VARCHAR(255),
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_category_overrides_category_id ON category_overrides(category_id);

-- create table
CREATE TABLE IF NOT EXISTS upstream_categories (
    category_id VARCHAR(50) NOT NULL,
    category_name VARCHAR(255) NOT NULL,
    category_type VARCHAR(20) NOT NULL, -- 'vod', 'live'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (category_id, category_type)
);

-- create indexes
CREATE INDEX IF NOT EXISTS idx_upstream_categories_name ON upstream_categories(category_name);
