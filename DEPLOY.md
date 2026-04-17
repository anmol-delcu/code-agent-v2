# Deploying on DigitalOcean

This guide covers deploying the full stack (frontend + backend + Docker) on a single DigitalOcean Droplet.

## Prerequisites

- A DigitalOcean account
- A domain name (optional, but recommended for SSL)
- SSH access to your Droplet

---

## Step 1: Create a Droplet

1. Go to [digitalocean.com](https://digitalocean.com) → **Create Droplet**
2. Settings:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic → Regular → **$12/mo** (2GB RAM, 1 CPU) minimum
   - **Region**: closest to your users
   - **Authentication**: SSH Key or Password
3. Click **Create Droplet** and note the IP address

---

## Step 2: SSH into the Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

---

## Step 3: Install dependencies

```bash
# System update
apt update && apt upgrade -y

# Docker
apt install -y docker.io
systemctl enable docker && systemctl start docker

# Bun
curl -fsSL https://bun.sh/install | bash
source /root/.bashrc

# Nginx + Certbot + Git
apt install -y nginx certbot python3-certbot-nginx git

# PM2
apt install -y npm
npm install -g pm2
```

---

## Step 4: Clone the repo

```bash
cd /opt
git clone https://github.com/anmol-delcu/code-agent-v2.git app
cd app
```

---

## Step 5: Set up environment variables

```bash
cp .env.example .env
nano .env
```

Fill in your values:

```
AI_BASE_URL=https://api.anthropic.com/v1
AI_API_KEY=your-anthropic-api-key
AI_MODEL=claude-sonnet-4-20250514
```

---

## Step 6: Install dependencies and build

```bash
# Backend
cd /opt/app/backend
bun install

# Frontend (production build)
cd /opt/app/frontend
bun install
bun run build
```

---

## Step 7: Configure Nginx

```bash
nano /etc/nginx/sites-available/app
```

Paste the following (replace `yourdomain.com` with your actual domain or remove the `server_name` line if using raw IP):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Backend API
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable config
ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

## Step 8: SSL certificate (requires a domain)

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Skip this step if using a raw IP address.

---

## Step 9: Start with PM2

```bash
cd /opt/app

# Find bun path
which bun   # e.g. /root/.bun/bin/bun

# Start backend
pm2 start "/root/.bun/bin/bun --env-file .env backend/src/index.ts" \
  --name backend \
  --cwd /opt/app

# Start frontend
pm2 start "/root/.bun/bin/bun run start" \
  --name frontend \
  --cwd /opt/app/frontend

# Save and enable auto-start on reboot
pm2 save
pm2 startup   # run the command it outputs
```

---

## Step 10: Verify

```bash
pm2 status                             # both should show 'online'
curl http://localhost:4000/containers  # backend health check
curl http://localhost:3000             # frontend health check
```

Open `http://YOUR_DROPLET_IP` or `https://yourdomain.com` in your browser.

---

## Updating the app

When you push new changes to GitHub, pull and rebuild on the server:

```bash
cd /opt/app
git pull

# If backend changed:
cd backend && bun install
pm2 restart backend

# If frontend changed:
cd /opt/app/frontend
bun install && bun run build
pm2 restart frontend
```

---

## Useful PM2 commands

```bash
pm2 status          # check running processes
pm2 logs            # view all logs
pm2 logs backend    # backend logs only
pm2 logs frontend   # frontend logs only
pm2 restart all     # restart everything
pm2 stop all        # stop everything
```

---

## Architecture

```
Browser
  └── Nginx (:80 / :443)
        ├── /api/*  → Express backend (:4000)
        │              └── Docker daemon (user project containers)
        └── /*      → Next.js frontend (:3000)
```

Chat sessions are persisted in `backend/data/sessions.db` (SQLite). This file survives restarts but will be lost if the Droplet is destroyed — back it up periodically if needed.
