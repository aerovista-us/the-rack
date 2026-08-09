# Deploying to GitHub Pages (The Rack)

Production target: **[therack.aerovista.us](https://therack.aerovista.us)** — same pattern as [thesignal.aerovista.us](https://thesignal.aerovista.us) / [aerovista-us/signal](https://github.com/aerovista-us/signal).

Serves from the **`main`** branch of **`aerovista-us/the-rack`** (static root: `index.html`, `rack.json`, `assets/`, `content/`). No build step.

## DNS (Cloudflare · aerovista.us)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `therack` | `aerovista-us.github.io` | **DNS only** (gray cloud) |

Gray cloud matters so GitHub can issue HTTPS for the custom domain (same as Signal).

## GitHub Pages

1. Repo: https://github.com/aerovista-us/the-rack
2. Settings → Pages → Source = **Deploy from a branch** → **`main` / `/ (root)`**
3. Custom domain = `therack.aerovista.us` (also set by root `CNAME` file)
4. Wait for “Certificate ready”

## Collab → GitHub sync

Working copy: `\\100.115.9.61\Collab\mini.shops\the_rack\vespera-the-rack`

```bash
# from a clone of aerovista-us/the-rack
rsync -av --exclude .git --exclude '*.yml' --exclude 'nginx-the-rack.conf' \
  /path/to/vespera-the-rack/ ./
# or copy changed files manually, then:
git add index.html rack.json rack.example.json assets/ content/ CNAME README.md SOT.json docs/
git status
git commit -m "Sync The Rack comic library from Collab."
git push origin main
```

Wait 1–2 minutes for Pages rebuild, then hard-refresh.

## Verify after deploy

- https://therack.aerovista.us/ — library UI
- https://therack.aerovista.us/rack.json — catalog JSON 200
- https://therack.aerovista.us/#/read/remodel-sos-volume-1/1 — Remodel SOS reader
- https://therack.aerovista.us/content/remodel-sos/pages/001.png — page asset 200

## Not used

- **Do not** host on `nxcore.tail79107c.ts.net` — AeroVista public sites use `*.aerovista.us` / `*.aerocoreos.com` subdomains.
- Local NXCore Traefik compose files (if present) are retired; optional local preview: `python -m http.server 8080`.
