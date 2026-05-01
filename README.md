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
