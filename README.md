# Good Vibrations News

Responsive dark-mode web app that aggregates free RSS feeds, analyzes article sentiment, filters for uplifting stories, and prioritizes AI coverage.

## Features

- Free RSS feed aggregation across uplifting, tech, and gaming sources
- AI-first ranking: stories with AI relevance appear first
- Positive sentiment filtering with keyword scoring + sentiment analysis
- Hourly background refresh with in-memory caching
- SQLite persistence for settings and last successful article snapshot
- Per-feed exponential backoff to reduce retry pressure when feeds fail/rate-limit
- Manual refresh endpoint and UI button
- UI sliders for live scoring control and immediate recompute
- Mobile-friendly dark mode interface

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open in browser:

- Local machine: `http://localhost:4000`
- Home network devices: `http://YOUR_PC_LAN_IP:4000`

The server listens on `0.0.0.0` by default so devices on your home network can reach it (if firewall rules allow it).

## API

- `GET /api/articles` -> return cached/analyzed articles
- `POST /api/refresh` -> force immediate feed refresh
- `GET /api/settings` -> return scoring settings
- `POST /api/settings` -> update scoring settings and recompute results
- `GET /api/health` -> service health
- `GET /api/debug/categories` -> category diagnostics (supports `q` and `limit` query params)

## Notes

- RSS providers may occasionally block requests or rate limit; feed health is shown in the UI.
- A failed feed gets temporary exponential backoff before retrying.
- Default schedule refreshes every hour (`60 * 60 * 1000` ms).
- Filtering is heuristic; tune keyword lists in `src/analyzer.js` for your preferences.
- SQLite database file is stored at `data/good-vibrations.db`.

## Run via Docker (Raspberry Pi or any Docker host)

The included `compose.yaml` pulls the latest code from the `main` branch of this repo every time the container starts, so it is always up to date without any manual git operations on the host.

### Prerequisites

- Docker and Docker Compose (v2) installed on the host

```bash
# Raspberry Pi / Debian-based
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # allow running docker without sudo (re-login after)
```

### First-time setup

```bash
mkdir ~/good-vibrations-news
cd ~/good-vibrations-news
curl -O https://raw.githubusercontent.com/RPollard66/GoodVibrationsNews/main/compose.yaml
docker compose up -d
```

This will:
1. Pull the latest `node:current-bookworm-slim` image
2. Clone this repo inside the container
3. Run `npm ci` and start the server on port **4000**
4. Start a Watchtower sidecar that checks every 5 minutes for updated Node images

### Access the app

- `http://<pi-ip-address>:4000`

### Common operations

```bash
# View logs
docker compose logs -f good-vibrations-news

# Stop
docker compose down

# Restart (also pulls latest code from GitHub)
docker compose restart good-vibrations-news

# Force full rebuild with latest code and Node image
docker compose pull && docker compose up -d --force-recreate
```

### Optional: change port

Create a `.env` file next to `compose.yaml`:

```
PORT=8080
```

Then restart: `docker compose up -d`

### Data persistence

Article cache and settings are stored in a Docker volume (`goodvibrationsnews_app_data`) and survive container restarts and image updates.

---

## Auto-start on boot (systemd)

This project includes a service file at `good-vibrations-news.service` that can be installed to systemd.

- Start service now:

```bash
sudo systemctl start good-vibrations-news.service
```

- Stop service:

```bash
sudo systemctl stop good-vibrations-news.service
```

- Restart service:

```bash
sudo systemctl restart good-vibrations-news.service
```

- Check status:

```bash
sudo systemctl status good-vibrations-news.service
```

- Enable at boot:

```bash
sudo systemctl enable good-vibrations-news.service
```
