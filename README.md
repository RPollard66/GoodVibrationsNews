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

## Run locally (no Docker)

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:4000` in your browser. The server listens on `0.0.0.0`
so other devices on your home network can reach it at
`http://YOUR_LAN_IP:4000` if your firewall allows.

## Run with Docker (recommended)

This is the easiest way to run Good Vibrations News on a Raspberry Pi, NAS,
home server, or any always-on machine. The container clones the latest code
from this repo on every start, so you stay up to date with no manual git
work, and a Watchtower sidecar keeps the base Node image current.

### 1. Install Docker

Pick the section for your operating system. You only need to do this once.

#### Linux (Raspberry Pi, Debian, Ubuntu, Fedora, Arch, etc.)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in (or reboot) so the group change takes effect. Verify:

```bash
docker --version
docker compose version
```

#### macOS

1. Download **Docker Desktop for Mac** from <https://www.docker.com/products/docker-desktop/>
   (choose Apple Silicon or Intel as appropriate).
2. Open the `.dmg`, drag Docker to Applications, and launch it.
3. Wait for the whale icon in the menu bar to stop animating.
4. Verify in Terminal:

   ```bash
   docker --version
   docker compose version
   ```

#### Windows 10 / 11

1. Make sure WSL 2 is enabled. From an admin PowerShell:

   ```powershell
   wsl --install
   ```

   Reboot if prompted.
2. Download **Docker Desktop for Windows** from <https://www.docker.com/products/docker-desktop/>
   and run the installer. Accept the WSL 2 backend option.
3. Launch Docker Desktop and wait for it to start.
4. Verify in PowerShell or Windows Terminal:

   ```powershell
   docker --version
   docker compose version
   ```

> **Tip for Windows users:** run all the commands below from a WSL 2 shell
> (Ubuntu, Debian, etc.) for the smoothest experience. PowerShell works too,
> but file paths and `curl` flags differ.

### 2. Get the Compose file and start the app

```bash
mkdir good-vibrations-news
cd good-vibrations-news
curl -O https://raw.githubusercontent.com/RPollard66/GoodVibrationsNews/main/compose.yaml
docker compose up -d
```

On Windows PowerShell replace the `curl -O` line with:

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/RPollard66/GoodVibrationsNews/main/compose.yaml -OutFile compose.yaml
```

What happens on first start:

1. Docker pulls the `node:current-bookworm-slim` base image.
2. The container clones this repo into a Docker volume.
3. `npm ci --omit=dev` installs dependencies.
4. `node server.js` starts the app on port **4000**.
5. The Watchtower sidecar begins checking every 5 minutes for an updated Node
   image.

The first start can take a few minutes (image download + npm install). Watch
progress with `docker compose logs -f good-vibrations-news`.

### 3. Open the app

- Same machine: <http://localhost:4000>
- Another device on your network: `http://<host-ip-address>:4000`

To find your host's LAN IP:

| OS                | Command                                |
| ----------------- | -------------------------------------- |
| Linux / macOS     | `ip addr` or `ifconfig`                |
| Windows (PS)      | `ipconfig`                             |
| Raspberry Pi OS   | `hostname -I`                          |

### Common Docker operations

```bash
# Show logs
docker compose logs -f good-vibrations-news

# Stop
docker compose down

# Restart (this also pulls latest code from GitHub)
docker compose restart good-vibrations-news

# Force a full rebuild with latest code AND latest Node image
docker compose pull && docker compose up -d --force-recreate

# Update Compose file itself if it changes upstream
curl -O https://raw.githubusercontent.com/RPollard66/GoodVibrationsNews/main/compose.yaml
docker compose up -d
```

### Change the port

Create a `.env` file next to `compose.yaml`:

```
PORT=8080
```

Then `docker compose up -d` to apply.

### Data persistence

The SQLite database, settings, and snapshots live in a Docker volume named
`<project>_app_data` (the project prefix matches the folder containing your
`compose.yaml`). The volume survives container restarts, image updates, and
code refreshes. To reset everything to defaults:

```bash
docker compose down
docker volume rm <project>_app_data
docker compose up -d
```

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
