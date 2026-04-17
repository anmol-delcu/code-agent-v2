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

> **Note**: If you add a DigitalOcean Cloud Firewall to your Droplet, make sure to allow inbound rules for:
> - HTTP (TCP port 80)
> - HTTPS (TCP port 443)
> - SSH (TCP port 22)
> - Custom TCP ports **8000–9000** (for Docker container previews)
>
> By default a new firewall blocks everything — missing port 80 will make the site unreachable.

---

## Step 2: SSH into the Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

If you get `Permission denied (publickey)`, use the **Console** button in the DigitalOcean dashboard to get browser-based access.

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

# Nginx + Certbot + Git + lsof
apt install -y nginx certbot python3-certbot-nginx git lsof

# PM2
apt install -y npm
npm install -g pm2
```

> **Note**: `lsof` is required by the backend for Docker port management. Install it explicitly.

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

# Public IP or domain of this server (used for Docker container preview URLs)
PUBLIC_HOST=YOUR_DROPLET_IP
```

Replace `YOUR_DROPLET_IP` with your actual Droplet IP (e.g. `68.183.82.217`), or your domain name if you have one.

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

Paste the following (replace `yourdomain.com` with your actual domain, or remove the `server_name` line if using raw IP):

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
# Find bun path
which bun   # e.g. /root/.bun/bin/bun

# Start backend — cwd MUST be /opt/app/backend so Dockerfile path resolves correctly
pm2 start "/root/.bun/bin/bun --env-file /opt/app/.env src/index.ts" \
  --name backend \
  --cwd /opt/app/backend

# Start frontend
pm2 start "/root/.bun/bin/bun run start" \
  --name frontend \
  --cwd /opt/app/frontend

# Save and enable auto-start on reboot
pm2 save
pm2 startup   # run the command it outputs
```

> **Critical**: The backend's `--cwd` must be `/opt/app/backend`, not `/opt/app`. The backend reads `./src/Dockerfile` relative to its working directory — using the wrong CWD causes `ENOENT: no such file or directory` errors when creating projects.

---

## Step 10: Verify

```bash
pm2 status                             # both should show 'online'
curl http://localhost:4000/containers  # should return {"success":true,"containers":[]}
curl http://localhost:3000             # frontend health check
```

Open `http://YOUR_DROPLET_IP` or `https://yourdomain.com` in your browser.

To verify the full flow, create a project — the first build takes **3–5 minutes** as it pulls the Node.js base image. Watch progress with:

```bash
pm2 logs backend --lines 0
```

---

## Updating the app

When you push new changes to GitHub, pull and rebuild on the server:

```bash
cd /opt/app
git fetch origin
git reset --hard origin/main   # use reset instead of pull to avoid merge conflicts

# If backend changed:
cd /opt/app/backend && bun install
pm2 restart backend

# If frontend changed:
cd /opt/app/frontend
bun install
rm -rf .next   # clean build to avoid stale cached files
bun run build
pm2 restart frontend
```

> **Note**: Always use `rm -rf .next` before rebuilding the frontend to ensure stale cached files don't end up in the new build.

---

## Useful PM2 commands

```bash
pm2 status               # check running processes
pm2 logs                 # view all logs
pm2 logs backend         # backend logs only
pm2 logs frontend        # frontend logs only
pm2 logs backend --lines 0   # tail live logs
pm2 restart all          # restart everything
pm2 stop all             # stop everything
pm2 delete backend       # remove a process (to re-add with different config)
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Site unreachable after adding firewall | Port 80 blocked | Add HTTP inbound rule in DO firewall |
| `Docker likely not running` error | Frontend hitting wrong URL | Rebuild frontend with `rm -rf .next && bun run build` |
| `ENOENT: no such file or directory, open './src/Dockerfile'` | Backend started from wrong CWD | Use `--cwd /opt/app/backend` in PM2 start |
| Project creation stuck at "Cleaning up..." | Docker daemon not running | `systemctl start docker && pm2 restart backend` |
| `git pull` fails with divergent branches | History diverged | Use `git fetch origin && git reset --hard origin/main` |
| Container preview not loading | Port 8000-9000 blocked | Add custom TCP 8000-9000 inbound rule in DO firewall |

---

## Architecture

```
Browser
  └── Nginx (:80 / :443)
        ├── /api/*  → Express backend (:4000)  [cwd: /opt/app/backend]
        │              └── Docker daemon → project containers (:8000–:9000)
        └── /*      → Next.js frontend (:3000)  [cwd: /opt/app/frontend]
```

Chat sessions are persisted in `backend/data/sessions.db` (SQLite). This file survives restarts but will be lost if the Droplet is destroyed — back it up periodically if needed.
