# Deployment Guide for NeroPanel

This guide explains how to host NeroPanel on a VPS, assign domains, and separate the Panel domain from the Host (streaming) domain.

## Prerequisites

1.  **VPS**: A Virtual Private Server (Ubuntu 20.04 or 22.04 LTS recommended).
2.  **Domain**: One or more domains (e.g., `yourdomain.com`).
3.  **SSH Client**: PuTTY (Windows) or Terminal (Mac/Linux).
4.  **Cloudflare Account**: Recommended for DNS and SSL management.

## Step 1: Prepare the VPS

1.  Connect to your VPS via SSH.
2.  Update the system:
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```
3.  Install Docker and Docker Compose:
    ```bash
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    ```

## Step 2: Upload the Code

Choose one of the following methods to upload your code to the VPS.

### Method A: Using Git (Recommended)
1.  **Install Git**:
    ```bash
    sudo apt install git -y
    ```
2.  **Clone your repository**:
    *   If **Public**:
        ```bash
        git clone https://github.com/yourusername/neropanel.git
        ```
    *   If **Private** (HTTPS Token):
        ```bash
        # You will be asked for username and a Personal Access Token (Password)
        git clone https://github.com/yourusername/neropanel.git
        ```
3.  **Enter the folder**:
    ```bash
    cd neropanel
    ```

### Method B: Using SCP or FileZilla
(See previous guides if you prefer manual upload)

## Step 3: Configure Environment

1.  Navigate to the project directory:
    ```bash
    cd neropanel
    ```
2.  Create a `.env` file:
    ```bash
    nano .env
    ```
3.  Add your secrets:
    ```env
    DB_PASSWORD=your_secure_db_password
    NEXTAUTH_SECRET=your_random_secret_string
    NEXTAUTH_URL=http://panel.yourdomain.com
    ```
    *Note: Replace `panel.yourdomain.com` with your actual panel domain.*

## Step 4: Configure Domains & Nginx

The project now includes a built-in Nginx server. You don't need to install Nginx manually on the VPS.

1.  **Edit the Nginx Config**:
    ```bash
    nano deployment/nginx.conf
    ```
2.  **Update Domain Names**:
    Find `server_name` lines and change them to your actual domains:
    *   `server_name panel.yourdomain.com;` -> Your Admin Panel domain.
    *   `server_name dns.yourdomain.com;` -> Your Streaming/DNS domain.

## Step 5: Start the Application

Run the application using Docker Compose. This will start the Database, App, Redis, and Nginx.

```bash
docker compose up -d --build
```

## Step 6: Cloudflare Configuration (Fix "Timed Out")

If you are using Cloudflare, you **MUST** follow these settings to avoid "Timed Out" or "Too many redirects" errors.

1.  **DNS Records**:
    *   Add an **A Record** for your panel (e.g., `panel`) pointing to your VPS IP. Make sure the **Proxy status** is **Proxied** (Orange Cloud).
    *   Add an **A Record** for your DNS host (e.g., `dns`) pointing to your VPS IP.

2.  **SSL/TLS Settings (CRITICAL)**:
    *   Go to **SSL/TLS** > **Overview** in Cloudflare.
    *   Set the encryption mode to **Flexible**.
    *   *Why?* The VPS listens on HTTP (Port 80). Cloudflare handles the HTTPS connection to the user and talks to the VPS over HTTP. If you set this to "Full" or "Strict", Cloudflare tries to talk to the VPS on Port 443, which will fail/timeout.

3.  **Edge Certificates**:
    *   Go to **SSL/TLS** > **Edge Certificates**.
    *   Enable **Always Use HTTPS**.

## Step 7: Firewall Configuration

If you cannot connect, your VPS firewall might be blocking the connection.

1.  Allow standard ports:
    ```bash
    sudo ufw allow 22/tcp   # SSH (Don't lock yourself out!)
    sudo ufw allow 80/tcp   # HTTP
    sudo ufw allow 443/tcp  # HTTPS
    sudo ufw enable
    ```

## Troubleshooting

### Build Errors (Snapshot not found)
If you see errors like `failed to prepare extraction snapshot` or `parent snapshot does not exist`, your Docker cache is corrupted. Run these commands:

```bash
docker compose down
docker builder prune -a -f
docker system prune -f
docker compose up -d --build --force-recreate
```

### Check Logs
```bash
docker compose logs -f
```

### Restart Nginx Only
If you changed `deployment/nginx.conf`:
```bash
docker compose restart nginx
```

### Database Errors
If you see "relation does not exist" errors:
```bash
cat migration_overrides.sql | docker compose exec -T postgres psql -U neropanel -d neropanel
```
