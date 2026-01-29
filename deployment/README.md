# Deployment Guide for NeroPanel

This guide explains how to host NeroPanel on a VPS, assign domains, and separate the Panel domain from the Host (streaming) domain.

## Prerequisites

1.  **VPS**: A Virtual Private Server (Ubuntu 20.04 or 22.04 LTS recommended).
2.  **Domain**: One or more domains (e.g., `yourdomain.com`).
3.  **SSH Client**: PuTTY (Windows) or Terminal (Mac/Linux).

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

### Method A: Using SCP (Recommended for Command Line)
If you are on Windows (PowerShell) or Mac/Linux, you can use `scp` to copy the entire folder securely.

1.  Open your terminal on your **local computer**.
2.  Run the following command (replace `your_vps_ip` with your actual server IP):
    ```bash
    # Run this from your Desktop folder
    scp -r NeroPanel root@your_vps_ip:/root/
    ```
    *Note: If you use a key file, add `-i path/to/key.pem` before the source folder.*

### Method B: Using FileZilla (Visual Interface)
1.  Download and install [FileZilla Client](https://filezilla-project.org/).
2.  Open FileZilla.
3.  **Host**: `sftp://your_vps_ip`
4.  **Username**: `root`
5.  **Password**: Your VPS password.
6.  Click **Quickconnect**.
7.  Drag the `NeroPanel` folder from your computer (Left side) to the server (Right side).

### Method C: Using Git (If using GitHub/GitLab)
1.  Push your code to a private repository.
2.  On the VPS, clone it:
    ```bash
    git clone https://github.com/yourusername/neropanel.git
    cd neropanel
    ```

## Step 3: Configure Environment

1.  Navigate to the project directory:
    ```bash
    cd NeroPanel
    ```
2.  Create a `.env` file (if not uploaded):
    ```bash
    nano .env
    ```
3.  Add your secrets (replace with secure values):
    ```env
    DB_PASSWORD=your_secure_db_password
    NEXTAUTH_SECRET=your_random_secret_string
    ```
    *Tip: You can generate a secret with `openssl rand -base64 32`.*

## Step 4: Start the Application

Run the application using Docker Compose:

```bash
docker compose up -d --build
```

This will start NeroPanel on port `3000`.

## Step 5: Assign Domains & Split Host/Panel

You can use **Nginx** to handle domains and separate the "Panel" (UI) from the "Host" (Streaming URL).

1.  Install Nginx:
    ```bash
    sudo apt install nginx -y
    ```

2.  Configure Nginx:
    *   Edit the default config or create a new one:
        ```bash
        sudo nano /etc/nginx/sites-available/neropanel
        ```
    *   Paste the configuration below (adjusting `server_name`):

    ```nginx
    upstream neropanel {
        server 127.0.0.1:3000;
    }

    # 1. THE PANEL (UI)
    server {
        listen 80;
        server_name panel.yourdomain.com; # <--- CHANGE THIS

        location / {
            proxy_pass http://neropanel;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }

    # 2. THE HOST (DNS/Streaming)
    server {
        listen 80;
        server_name dns.yourdomain.com; # <--- CHANGE THIS

        location / {
            proxy_pass http://neropanel;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  Enable the site and restart Nginx:
    ```bash
    sudo ln -s /etc/nginx/sites-available/neropanel /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

4.  **DNS Records**:
    *   Go to your Domain Registrar (Namecheap, GoDaddy, Cloudflare).
    *   Create an **A Record** for `panel` pointing to your VPS IP.
    *   Create an **A Record** for `dns` (or whatever you call the host) pointing to your VPS IP.

## Step 6: SSL (HTTPS)

Secure your domains with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d panel.yourdomain.com -d dns.yourdomain.com
```

Follow the prompts to enable HTTPS.

## Summary

*   **Panel URL**: `https://panel.yourdomain.com` (Used by you to manage)
*   **Host URL**: `http://dns.yourdomain.com` (Used in IPTV players)
