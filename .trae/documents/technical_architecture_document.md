## 1. Architecture design

```mermaid
graph TD
    A[User Browser / Player] --> B[Next.js Frontend]
    B --> C[API Routes Layer]
    C --> D[Proxy Service]
    C --> E[Local Content Service]
    C --> F[Upstream Fetcher]
    F --> G[Upstream Xtream Servers]
    D --> H[player_api.php Endpoint]
    H --> I[Content Router]
    I --> J[Upstream Proxy/Redirect]
    I --> K[Local Content Serve]
    C --> L[PostgreSQL Database]

    subgraph "Frontend Layer"
        B
    end

    subgraph "Backend Services (Next.js API Routes)"
        C
        D
        E
        F
        H
        I
    end

    subgraph "Data Layer"
        L
    end

    subgraph "External Services"
        G
    end
```

## 2. Technology Description

- Frontend: Next.js@14 (App Router) + React@18 + TypeScript@5
- Styling: Tailwind CSS@3 + shadcn/ui components
- Database: PostgreSQL (Docker containerized)
- Backend: Next.js API Routes (serverless functions)
- Initialization Tool: create-next-app
- Containerization: Docker + Docker Compose
- Key Dependencies:
  - pg@8 (PostgreSQL client)
  - next@14 (Next.js framework)
  - lucide-react@latest (icons)
  - react-hook-form@7 (form handling)
  - zod@3 (schema validation)
  - axios@1 (HTTP requests to upstream servers)
  - node-cache@5 (in-memory caching)

## 3. Route definitions

| Route | Purpose |
|-------|---------|
| / | Dashboard page, displays system overview and upstream connection status |
| /upstream | Upstream configuration page, manage Xtream server connections |
| /local-content | Local content manager page, add/edit local movies and series |
| /content-browser | Unified content browser with search and filtering |
| /api-monitor | Real-time API monitoring and request logging |
| /routing-rules | Configure content routing and load balancing rules |
| /api/player_api.php | Main proxy endpoint that mimics Xtream API format |
| /api/upstream/test | Test upstream server connectivity |
| /api/content/local | Manage local content CRUD operations |
| /api/sync/now | Trigger manual sync with upstream servers |

## 4. API definitions

### 4.1 Player API (Proxy Endpoint)

**Get VOD Streams (mimics Xtream API)**
```
GET /api/player_api.php?username={username}&password={password}&action=get_vod_streams
```

Request Parameters:
| Param Name | Param Type | isRequired | Description |
|------------|-------------|-------------|-------------|
| username | string | true | User credentials (validated against local config) |
| password | string | true | User credentials (validated against local config) |
| action | string | true | Action type: 'get_vod_streams', 'get_live_streams', 'get_series' |

Response Format (Xtream-compatible JSON):
```json
[
  {
    "stream_id": "123",
    "name": "Movie Title",
    "stream_icon": "https://...",
    "stream_type": "movie",
    "container_extension": "mp4",
    "stream_url": "https://...",
    "source": "upstream|local"
  }
]
```

### 4.2 Upstream Management API

**Test Upstream Connection**
```
POST /api/upstream/test
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|-------------|-------------|-------------|
| serverUrl | string | true | Upstream Xtream server URL |
| username | string | true | Xtream API username |
| password | string | true | Xtream API password |

Response:
| Param Name | Param Type | Description |
|------------|-------------|-------------|
| success | boolean | Connection test result |
| message | string | Status message |
| serverInfo | object | Upstream server information |

### 4.3 Local Content API

**Add Local Movie**
```
POST /api/content/local
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|-------------|-------------|-------------|
| title | string | true | Movie title |
| description | string | false | Movie description |
| posterUrl | string | false | URL to poster image |
| streamUrl | string | true | External streaming URL |
| genre | string[] | false | Array of genres |
| releaseYear | number | false | Release year |
| rating | number | false | Rating (0-10) |

## 5. Server architecture diagram

```mermaid
graph TD
    A[Client Request] --> B[API Route Handler]
    B --> C[Authentication Middleware]
    C --> D[Request Validator]
    D --> E[Content Service]
    E --> F[Content Router]
    F --> G[Upstream Proxy Service]
    F --> H[Local Content Service]
    G --> I[External Xtream Server]
    H --> J[PostgreSQL Database]
    E --> J

    subgraph "Next.js API Routes"
        B
        C
        D
        E
        F
        G
        H
    end

    subgraph "External Services"
        I
    end

    subgraph "Data Layer"
        J
    end
```

## 6. Data model

### 6.1 Data model definition

```mermaid
erDiagram
    UPSTREAM_SERVERS ||--o{ SYNCED_CONTENT : provides
    SYNCED_CONTENT ||--o{ CONTENT_ROUTING : routed_by
    LOCAL_CONTENT ||--o{ CONTENT_ROUTING : routed_by
    USERS ||--o{ LOCAL_CONTENT : manages
    USERS ||--o{ SYSTEM_LOGS : generates
    
    UPSTREAM_SERVERS {
        uuid id PK
        string server_url UK
        string username
        string password_hash
        boolean is_active
        integer timeout_seconds
        timestamp last_sync_at
        timestamp created_at
    }
    
    SYNCED_CONTENT {
        uuid id PK
        uuid upstream_server_id FK
        string stream_id
        string name
        string stream_type
        string stream_icon
        string stream_url
        json metadata
        timestamp synced_at
    }
    
    LOCAL_CONTENT {
        uuid id PK
        string title
        text description
        string content_type
        string poster_url
        string stream_url
        json metadata
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }
    
    CONTENT_ROUTING {
        uuid id PK
        string content_id
        string content_source
        string routing_type
        integer priority
        json routing_config
    }
    
    USERS {
        uuid id PK
        string username UK
        string password_hash
        string role
        boolean is_active
        timestamp created_at
        timestamp last_login
    }
    
    SYSTEM_LOGS {
        uuid id PK
        uuid user_id FK
        string log_level
        string message
        json context
        timestamp created_at
    }
```

### 6.2 Data Definition Language

**Upstream Servers Table**
```sql
-- create table
CREATE TABLE upstream_servers (
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
CREATE INDEX idx_upstream_servers_active ON upstream_servers(is_active);
CREATE INDEX idx_upstream_servers_last_sync ON upstream_servers(last_sync_at);
```

**Synced Content Table**
```sql
-- create table
CREATE TABLE synced_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upstream_server_id UUID REFERENCES upstream_servers(id) ON DELETE CASCADE,
    stream_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    stream_type VARCHAR(20) CHECK (stream_type IN ('live', 'vod', 'series')),
    stream_icon TEXT,
    stream_url TEXT,
    metadata JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(upstream_server_id, stream_id)
);

-- create indexes
CREATE INDEX idx_synced_content_server ON synced_content(upstream_server_id);
CREATE INDEX idx_synced_content_type ON synced_content(stream_type);
CREATE INDEX idx_synced_content_name ON synced_content(name);
CREATE INDEX idx_synced_content_synced_at ON synced_content(synced_at DESC);
```

**Local Content Table**
```sql
-- create table
CREATE TABLE local_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_type VARCHAR(20) CHECK (content_type IN ('movie', 'series')),
    poster_url TEXT,
    stream_url TEXT NOT NULL,
    metadata JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX idx_local_content_type ON local_content(content_type);
CREATE INDEX idx_local_content_created_at ON local_content(created_at DESC);
CREATE INDEX idx_local_content_created_by ON local_content(created_by);
```

**Content Routing Table**
```sql
-- create table
CREATE TABLE content_routing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id VARCHAR(100) NOT NULL,
    content_source VARCHAR(20) CHECK (content_source IN ('upstream', 'local')),
    routing_type VARCHAR(20) CHECK (routing_type IN ('proxy', 'redirect', 'direct')),
    priority INTEGER DEFAULT 100 CHECK (priority >= 0 AND priority <= 1000),
    routing_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- create indexes
CREATE INDEX idx_routing_content ON content_routing(content_id, content_source);
CREATE INDEX idx_routing_priority ON content_routing(priority DESC);
```

**Users Table**
```sql
-- create table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- create indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active);
```

### 6.3 Docker Configuration

**Dockerfile**
```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat postgresql-client
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

**docker-compose.yml**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: neropanel
      POSTGRES_USER: neropanel
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://neropanel:${DB_PASSWORD}@postgres:5432/neropanel
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=http://localhost:3000
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./public:/app/public
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```