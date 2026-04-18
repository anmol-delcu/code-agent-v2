<a name="readme-top"></a>

<div align="center">

<h3 align="center">Delcu Code Agent</h3>

  <p align="center">
    An open-source, self-hosted AI development platform — a privacy-first alternative to Loveable, Replit, and Bolt.
    Build full-stack Next.js applications from natural language prompts, with multi-user support and live Docker previews.
    <br />
    <br />
    <a href="#get-started">Get started locally</a>
    ·
    <a href="DEPLOY.md">Deploy to server</a>
    ·
    <a href="https://github.com/ntegrals/december/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=">Report Bug</a>
  </p>
</div>

<a href="https://github.com/ntegrals/december">
  <img src=".assets/preview.png" alt="Delcu Code Agent Preview">
</a>

## Features

- AI-powered project creation from natural language prompts
- Multi-user support with JWT authentication (signup / login)
- Each user gets isolated Docker containers — only one active at a time
- Live preview with mobile and desktop views
- Chat history persisted in SQLite across restarts
- Full-featured Monaco code editor with file management
- Real-time streaming AI responses
- Document and image attachments in chat
- Project export

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, Tailwind CSS, Monaco Editor |
| Backend | Express.js on Bun runtime |
| AI | OpenAI-compatible SDK (Anthropic Claude recommended) |
| Containers | Docker via Dockerode |
| Database | SQLite via `bun:sqlite` |
| Auth | JWT + `Bun.password` (bcrypt argon2) |

## Get started

### Local development

1. Clone the repo

   ```sh
   git clone https://github.com/anmol-delcu/code-agent-v2
   cd code-agent-v2
   ```

2. Copy the env file and fill in your API key

   ```sh
   cp .env.example .env
   ```

   Edit `.env`:

   ```
   AI_BASE_URL=https://api.anthropic.com/v1
   AI_API_KEY=sk-ant-...
   AI_MODEL=claude-sonnet-4-20250514
   PUBLIC_HOST=localhost
   JWT_SECRET=any-long-random-string
   ```

   Claude Sonnet 4 from Anthropic is strongly recommended for best results.

3. Install Docker and make sure it is running

   - [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
   - [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
   - [Docker Engine for Linux](https://docs.docker.com/engine/install/)

4. Run the start script

   ```sh
   sh start.sh
   ```

5. Open [http://localhost:3000](http://localhost:3000), create an account, and start building.

   The backend runs on port 4000. The frontend runs on port 3000.

### Server deployment

See [DEPLOY.md](DEPLOY.md) for full instructions on deploying to a DigitalOcean Droplet (or any Linux VM) with Nginx, PM2, and SSL.

## Architecture

```
Browser
  └── Nginx (:80 / :443)
        ├── /api/*  →  Express backend (:4000)  [Bun runtime]
        │               ├── Auth routes  (/auth/signup, /auth/login)
        │               ├── Container routes  (/containers/*)
        │               ├── Chat routes  (/chat/*)
        │               └── Docker daemon  → project containers (:8000–:9000)
        └── /*      →  Next.js frontend (:3000)
```

Data is persisted in `backend/data/app.db` (SQLite) with three tables: `users`, `projects`, `sessions`.

## Environment variables

| Variable | Description |
|---|---|
| `AI_BASE_URL` | Base URL for AI provider (e.g. `https://api.anthropic.com/v1`) |
| `AI_API_KEY` | Your AI provider API key |
| `AI_MODEL` | Model name (e.g. `claude-sonnet-4-20250514`) |
| `PUBLIC_HOST` | Public IP or domain of the server — used for Docker container preview URLs |
| `JWT_SECRET` | Secret for signing JWT tokens — use a long random string in production |

## Disclaimer

This is an experimental application provided "as-is" without any warranty. By using this software you agree to assume all risks, including data loss or unexpected API charges. Monitor your AI API usage and set billing limits with your provider.

## License

Distributed under the MIT License. See `LICENSE` for more information.
