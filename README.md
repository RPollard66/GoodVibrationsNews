# Good Vibrations News

A self-hosted, dark-mode news reader that aggregates RSS feeds from positive,
hands-on, and curiosity-driven sources — science, AI, makers, gaming, Android,
tech, ham radio, green tech, birding, weather, and good news — and filters out
the noise (politics, doom, coupon spam) so what's left is genuinely worth
reading.

You run it on your own machine (or a Raspberry Pi), point your browser at it,
and it stays fresh on its own.

## Features

- **~99 curated RSS feeds** out of the box, each tagged with a category
- **Source-based categorization** — every feed declares its own topic, so
  articles aren't guessed at by keyword classifiers
- **11 topic filters** in the UI: Science, AI, Maker, Gaming, Android, Tech,
  Radio, Green, Birding, Weather, General. Empty filters auto-hide.
- **Tune topics** panel — per-category weight (Off / Less / Normal / More) and
  per-category minimum slot guarantee, without forced quotas
- **Per-feed cap slider** — control how many items each feed contributes to the
  rank pool (lower = more diversity, higher = more depth from each source)
- **Exclusion filters** — politics, hard-negative news, non-Tesla/SpaceX vehicle
  spam, and coupon-code promos are stripped out
- **Manage feeds in the UI** — add, remove, or recategorize any feed at runtime
- **Hourly auto-refresh** with a manual "Refresh now" button
- **SQLite persistence** for feeds, settings, and last article snapshot
- **Per-feed exponential backoff** so flaky feeds don't slow everything down
- **Mobile-friendly** responsive layout

## Run locally (for running with Docker see below)

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:4000` in your browser. The server listens on `0.0.0.0`
so other devices on your home network can reach it at
`http://YOUR_LAN_IP:4000` if your firewall allows.

## Run with Docker (recommended)

The container clones the latest code from this repo on every start, so you
stay up to date with no manual git work, and a Watchtower sidecar keeps the
base Node image current.

### 1. Install Docker

Install Docker (with Compose v2) using the preferred method for your OS —
e.g. Docker Desktop on macOS/Windows, or your distro's package manager /
`get.docker.com` script on Linux. See <https://docs.docker.com/get-docker/>.

Verify with:

```bash
docker --version
docker compose version
```

### 2. Get the Compose file

Create a folder for the app, then download `compose.yaml` from this repo
into it:

<https://raw.githubusercontent.com/RPollard66/GoodVibrationsNews/main/compose.yaml>

You can save it with your browser, `curl -O`, or PowerShell's
`Invoke-WebRequest` — whatever's easiest. The only thing that matters is
that the file ends up named `compose.yaml` in the folder you'll run Docker
from.

(Optional) create a `.env` file next to `compose.yaml` to override defaults:

```
PORT=8080
```

### 3. Start, manage, and update

Run all of these from the folder containing `compose.yaml`:

```bash
# Start (or apply config changes)
docker compose up -d

# View logs
docker compose logs -f good-vibrations-news

# Stop
docker compose down

# Restart (also pulls latest code from GitHub)
docker compose restart good-vibrations-news

# Full rebuild with latest code AND latest Node image
docker compose pull && docker compose up -d --force-recreate
```

Then open <http://localhost:4000> (or `http://<host-ip>:4000` from another
device on your network).

Data persists in a Docker volume (`<project>_app_data`) and survives
restarts and updates.

## API

Mostly internal, but useful for scripting:

- `GET /api/articles` — current cached/analyzed article list
- `POST /api/refresh` — force an immediate refresh
- `GET /api/feeds` — list feeds + categories + current settings
- `POST /api/feeds` — add a feed (`{ label, url, category }`)
- `PATCH /api/feeds/:id` — change a feed's category (`{ category }`)
- `DELETE /api/feeds/:id` — remove a feed
- `POST /api/settings/max-total-articles` — `{ value }`
- `POST /api/settings/per-feed-cap` — `{ value }`, 3–15
- `POST /api/settings/category-weights` — `{ weights: { science: "more", ... } }`
- `POST /api/settings/category-minimums` — `{ minimums: { radio: 2, ... } }`
- `GET /api/health` — service health check

## How filtering and ranking work

1. Each feed is fetched in parallel; per-feed exponential backoff on errors.
2. The first N items per feed (per-feed cap, default 8) enter the rank pool.
3. Articles are filtered to drop politics, hard-negative news, non-Musk
   vehicles, and coupon-code promos.
4. Survivors are ranked by `pubDate` (recency).
5. User category weights multiply each article's rank score
   (Off = 0, Less = 0.5, Normal = 1.0, More = 2.0).
6. Per-category minimums reserve top slots for chosen categories before the
   rest of the top-N is filled by recency.
7. The final list is re-sorted by date for display.

Categorization comes from the feed itself (defined in source), not from
keyword classifiers or AI sentiment scoring.

## Auto-start on boot (Linux + systemd, no Docker)

If you'd rather run the Node app directly under systemd instead of Docker, a
service file is included.

```bash
sudo cp good-vibrations-news.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now good-vibrations-news.service
sudo systemctl status good-vibrations-news.service
```

Edit the service file first if your install path differs from the default.

## Notes

- RSS providers occasionally rate-limit or block requests. Failing feeds back
  off and retry automatically; per-feed status is visible in the API
  response.
- The default refresh interval is 1 hour.
- The SQLite file lives at `data/good-vibrations.db` (or inside the
  `app_data` volume in Docker).
