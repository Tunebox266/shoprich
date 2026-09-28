# Deployment Guide — WA-AKG

This is a single application. The WhatsApp engine, dashboard, and landing/pricing all live in this repository. There is no separate marketing app.

## Real hosting reality (honest, as of 2026)

This app requires a continuously running process (**WhatsApp/Baileys WebSocket 24/7 + socket.io + node-cron**). Serverless platforms (Vercel/Netlify/Cloudflare) cannot support it.
And "free + always-on + no card" PaaS options are almost gone:

| Platform | Cost | 24/7? | Notes |
|---|---|---|---|
| **Oracle Cloud Always Free** | 🆓 Free forever | ✅ | ARM VM (≤24GB RAM). This is a VPS (requires setup); signup needs a verification card |
| **Your own device** (PC/RasPi/Termux) | 🆓 | ✅ | No cloud, no card. Good for personal use |
| **Render Starter** | 💲 ~$7/mo | ✅ | Easiest and stable |
| **Cheap VPS** (Contabo/Hetzner/etc.) | 💲 ~$3–5/mo | ✅ | Full control |
| **Render Free** | 🆓 | ❌ | Auto-sleep after 15 minutes → WA disconnects. For testing only |
| **Koyeb / Fly.io / Railway** | trial→💲 | — | No longer free (needs card / trial expires) |
| **Vercel / Netlify** | 🆓 | ❌ | Serverless → WhatsApp engine dies. UI only |

> Conclusion: **free + no VPS + WA 24/7 = no longer realistic**. Real free options are Oracle Always Free or self-hosting on your own device.

---

## ⚠️ Why the engine does NOT work on Vercel / Netlify / Cloudflare

- Custom HTTP server + **Socket.io** (`src/server/index.ts` via `bootstrap.ts`)
- Persistent **WhatsApp (Baileys)** connection in memory (`waManager`)
- **node-cron** scheduler + auto-broadcast, plus in-memory state (anti-spam, JPM lock)

Serverless platforms shut down after each request → the WhatsApp connection keeps dropping. This is not a bug.

---

## Opsi A — Oracle Cloud Always Free (free forever, but requires setup)

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) (verification card may be required).
2. Create a **VM Instance** → choose **Ampere A1 (ARM)**, OS Ubuntu. Always Free gives up to 4 vCPU / 24GB RAM.
3. Open firewall ports (Security List + `iptables`/`ufw`) for your HTTP port.
4. SSH into the VM and install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
5. Clone the repo and build/run it (see "Ops D — Docker" below).
6. Install Nginx/Caddy for HTTPS + domain (optional).

> ARM capacity can run out; try another region or retry later.

## Opsi B — Self-hosted (100% free)

A spare PC/laptop, Raspberry Pi, or Android (Termux). As long as your internet connection is stable and the device stays on, it works.
Run it via Docker or directly with Node (see Ops D / E).

## Opsi C — Render Starter (paid, easiest)

1. Render → **New → Blueprint**, choose the repo (it will use `render.yaml` automatically).
2. Fill in secret env vars (`sync: false`) in the dashboard.
3. Disk `/app/data` is already defined for media (persistent).
4. Use the **Starter** plan — do NOT use Free (auto-sleep → WA disconnects).

## Opsi D — Docker (for Oracle / VPS / self-hosted)

```bash
git clone https://github.com/Vinsaeroy/WA-AKG.git
cd WA-AKG
# prepare .env from .env.example
docker build -t wa-akg .
docker run -d --name wa-akg \
  --env-file .env \
  -p 3030:3030 \
  -v $PWD/data:/app/data \
  --restart unless-stopped \
  wa-akg
```

## Opsi E — Run directly with Node (without Docker)

```bash
npm ci
npm run db:push          # once, if the DB is still empty
npm run build
npm run start            # custom server on PORT (default 3030)
```

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (e.g., from Neon — free) |
| `AUTH_SECRET` | ✅ | Random string — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_TRUST_HOST` | ✅ | `true` |
| `BASE_URL` | ✅ | Public URL, e.g. `https://wa.domain.com` or `http://IP:3030` |
| `NEXTAUTH_URL` | ✅ | Same as `BASE_URL` |
| `NEXT_PUBLIC_APP_URL` | ✅ | Same as `BASE_URL` |
| `NEXT_PUBLIC_API_URL` | ✅ | `BASE_URL` + `/api` |
| `PORT` | ⬜ | Default 3030 |
| `TZ` | ⬜ | `Asia/Jakarta` |
| `NODE_OPTIONS` | ⬜ | Small RAM: `--max-old-space-size=400` |
| `NEXT_PUBLIC_SWAGGER_USERNAME/PASSWORD` | ⬜ | Login for `/swagger` |
| `KLIKQRIS_*` | ⬜ | Fallback; better to configure via the dashboard (SUPERADMIN) |

> ⚠️ Set `BASE_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_*` to the correct public URL/IP.
> Setting them incorrectly causes login redirect issues.

---

## After Deploy (MANDATORY)

1. **Prepare the database** (if empty): `npm run db:push`.
   If using the same Neon DB as local, the tables already exist → skip this.
2. **Create an admin:** the first user to register at `/auth/register` becomes SUPERADMIN,
   or run `npm run make-admin`.
3. **Payment gateway:** log in as SUPERADMIN → Settings → Payment Gateway. KlikQRIS webhook:
   `https://<your-domain>/api/billing/callback`.
4. **Persistence:** WhatsApp sessions are stored in the database (`AuthState`) so they survive redeploys; media is stored in `/app/data/media` → mount a volume so it does not get lost.

---

## Checklist
- [ ] Host is always-on (Oracle/VPS/self-hosted/Render Starter) — not Vercel/Render Free
- [ ] `DATABASE_URL` is valid and `npm run db:push` succeeds (for a new DB)
- [ ] `AUTH_SECRET` is set
- [ ] `BASE_URL` / `NEXTAUTH_URL` / `NEXT_PUBLIC_*` point to the correct URL/IP
- [ ] Volume `/app/data` is mounted
