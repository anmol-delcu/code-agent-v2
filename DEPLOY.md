# Deploying on DigitalOcean

This guide covers deploying the full stack (frontend + backend + Docker) on a single DigitalOcean Droplet (or any Ubuntu 22.04 VM).

---

## Prerequisites

- A DigitalOcean account (or any Linux VPS)
- SSH access to the server
- A domain name (optional, but required for SSL)

---

## Step 1: Create a Droplet

1. Go to [digitalocean.com](https://digitalocean.com) → **Create Droplet**
2. Settings:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic → Regular → **$12/mo** (2GB RAM, 1 CPU) minimum
   - **Region**: closest to your users
   - **Authentication**: SSH Key or Password
3. Click **Create Droplet** and note the IP address

> **Firewall rules**: If you add a DigitalOcean Cloud Firewall, allow inbound:
> - HTTP (TCP 80)
> - HTTPS (TCP 443)
> - SSH (TCP 22)
> - Custom TCP **8000–9000** (Docker container preview ports)

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

# Nginx + Certbot + Git + lsof
apt install -y nginx certbot python3-certbot-nginx git lsof

# PM2
apt install -y npm
npm install -g pm2
```

> `lsof` is required by the backend for Docker port management.

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

Fill in all values:

```
AI_BASE_URL=https://api.anthropic.com/v1
AI_API_KEY=your-anthropic-api-key
AI_MODEL=claude-sonnet-4-20250514

# Public IP or domain of this server
PUBLIC_HOST=YOUR_DROPLET_IP

# Long random string for JWT signing
JWT_SECRET=your-super-secret-jwt-key
```

Generate a strong JWT secret:
```bash
openssl rand -hex 32
```

---

## Step 6: Install dependencies and build

```bash
# Backend
cd /opt/app/backend
/root/.bun/bin/bun install

# Frontend (production build)
cd /opt/app/frontend
/root/.bun/bin/bun install
/root/.bun/bin/bun run build
```

---

## Step 7: Configure Nginx

```bash
nano /etc/nginx/sites-available/app
```

Paste the following (replace `yourdomain.com` with your domain, or remove `server_name` if using a raw IP):

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
# Backend — cwd MUST be /opt/app/backend so Dockerfile path resolves correctly
pm2 start "/root/.bun/bin/bun --env-file /opt/app/.env src/index.ts" \
  --name backend \
  --cwd /opt/app/backend

# Frontend
pm2 start "/root/.bun/bin/bun run start" \
  --name frontend \
  --cwd /opt/app/frontend

# Save process list and enable auto-start on reboot
pm2 save
pm2 startup   # run the command it outputs
```

---

## Step 10: Verify

```bash
pm2 status                              # both should show 'online'
curl http://localhost:4000/auth/me      # should return 401 (auth required)
curl http://localhost:3000              # frontend health check
```

Open `http://YOUR_DROPLET_IP` in your browser, create an account at `/signup`, and start building.

The first Docker build takes **3–5 minutes** as it pulls the base image. Watch progress with:

```bash
pm2 logs backend --lines 0
```

---

## Updating the app

```bash
cd /opt/app
git fetch origin
git reset --hard origin/main   # use reset to avoid merge conflicts

# If backend changed:
cd /opt/app/backend && /root/.bun/bin/bun install
pm2 restart backend

# If frontend changed:
cd /opt/app/frontend
/root/.bun/bin/bun install
rm -rf .next   # always clean before rebuild
/root/.bun/bin/bun run build
pm2 restart frontend
```

---

## After a server reboot

```bash
export PATH="$HOME/.bun/bin:$PATH"
systemctl start docker
pm2 resurrect
pm2 status
```

To avoid this after every reboot, ensure `pm2 startup` was run during initial setup.

---

## Useful commands

```bash
pm2 status                        # check running processes
pm2 logs                          # view all logs
pm2 logs backend --lines 0        # tail live backend logs
pm2 restart all                   # restart everything
pm2 stop all                      # stop everything

# Stop all user project containers (free up RAM)
docker ps --filter "label=project=december" -q | xargs -r docker stop

# Stop and remove all project containers + images (free up disk)
docker ps -a --filter "label=project=december" -q | xargs -r docker rm -f
docker images --filter "label=project=december" -q | xargs -r docker rmi -f

# Check disk / memory usage
docker system df
free -h
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 502 Bad Gateway | Frontend or backend process is down | `pm2 status` then `pm2 restart all` |
| `bun: command not found` | bun not in PATH | Use full path `/root/.bun/bin/bun` or run `source ~/.bashrc` |
| Build fails with `SiCss` error | Wrong react-icons version | `cd frontend && /root/.bun/bin/bun install && rm -rf .next && /root/.bun/bin/bun run build` |
| `Cannot find module '../../config'` | `backend/config.ts` missing | `git reset --hard origin/main` then restart backend |
| `ENOENT: no such file or directory, open './src/Dockerfile'` | Backend started from wrong CWD | Use `--cwd /opt/app/backend` in PM2 start command |
| `401 Invalid Anthropic API Key` | `.env` not loaded by PM2 | Use `--env-file /opt/app/.env` in PM2 start command |
| `Docker likely not running` on frontend | Docker daemon stopped | `systemctl start docker && pm2 restart backend` |
| Container preview not loading | Ports 8000-9000 blocked | Add custom TCP 8000-9000 inbound rule in firewall |
| Site unreachable after adding firewall | Port 80 blocked | Add HTTP inbound rule in DigitalOcean firewall |
| `git pull` fails with divergent branches | History diverged | `git fetch origin && git reset --hard origin/main` |
| JSON parse error on signup/login | Backend not running | `curl http://localhost:4000/auth/me` to diagnose |

---

## Architecture

```
Browser
  └── Nginx (:80 / :443)
        ├── /api/*  → Express backend (:4000)  [cwd: /opt/app/backend]
        │              ├── /auth/*     – signup, login, JWT
        │              ├── /containers/* – Docker management (auth required)
        │              ├── /chat/*     – AI chat (auth required)
        │              └── Docker daemon → project containers (:8000–:9000)
        └── /*      → Next.js frontend (:3000)  [cwd: /opt/app/frontend]
```

**Database**: `backend/data/app.db` (SQLite, three tables: `users`, `projects`, `sessions`).
Back this file up periodically — it is the only stateful data on the server.

```bash
# Quick backup
cp /opt/app/backend/data/app.db /root/app-backup-$(date +%Y%m%d).db
```
