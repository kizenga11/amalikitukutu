# C++ IDE — Judge0 setup

The practical-question IDE runs student code on a **self-hosted Judge0 CE**
instance. The browser never talks to Judge0: the only caller is the Next.js
route handler at `src/app/api/run/route.ts`, which authenticates the student,
checks that the question is practical, enforces the deadline/lock and a
10-runs-per-minute limit, then forwards the code over HTTPS with the Judge0
auth token.

```
Student browser ──POST /api/run──▶ Next.js (Vercel) ──POST /submissions──▶ Judge0 CE (VPS)
        ▲                                    │
        └──────── result (stdout, errors) ◀───┘
```

Nothing in this document changes the portal's auth, assignments or submission
flow.

> **Current mode: write-only.** The IDE is available to students today, but the
> **Endesha (Run)** button, stdin and output stay hidden because no Judge0 server
> exists yet. Students write C++ and submit it as their answer. Everything below
> is only needed when you are ready to enable running. After Judge0 is deployed
> and `JUDGE0_URL` / `JUDGE0_KEY` are set, add `NEXT_PUBLIC_IDE_RUN=on` and
> redeploy — the IDE then shows Run, stdin and output automatically.

---

## 1. Requirements

| Item | Minimum | Recommended |
| --- | --- | --- |
| OS | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 vCPU | 2–4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 40 GB |
| Network | public IPv4 + a DNS name | same |

Judge0 compiles and runs untrusted code, so give it its **own** VPS. Do not
install it on the same machine as a database or anything else you care about.

DNS: create an `A` record such as `judge0.example.com` pointing at the VPS
before you request the TLS certificate.

---

## 2. Base system

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg unzip ufw

# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

docker --version
docker compose version
```

Firewall — only SSH and the HTTPS proxy are public. Judge0 itself must stay on
loopback (see §6):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 3. cgroup v1 (required on Ubuntu 22.04+)

Judge0's sandbox (`isolate`) needs **cgroup v1**. Ubuntu 22.04 and 24.04 boot
with cgroup v2 by default, so switch back:

```bash
sudo nano /etc/default/grub
```

Set (merge into the existing `GRUB_CMDLINE_LINUX_DEFAULT`):

```
GRUB_CMDLINE_LINUX_DEFAULT="systemd.unified_cgroup_hierarchy=0"
```

```bash
sudo update-grub
sudo reboot
```

After the reboot verify **both**:

```bash
stat -fc %T /sys/fs/cgroup     # must print: tmpfs
docker info | grep -i cgroup   # must show: Cgroup Version: 1
```

If it still says `cgroup2fs` / `Cgroup Version: 2`, the GRUB change did not
apply and Judge0 submissions will fail with *Internal Error*.

---

## 4. Install Judge0 CE

```bash
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip
cd judge0-v1.13.1
```

The archive contains `docker-compose.yml` and `judge0.conf`.

### 4.1 Keep the API on loopback

Open `docker-compose.yml` and change the published port of the `server`
service from `2358:2358` to:

```yaml
    ports:
      - "127.0.0.1:2358:2358"
```

Docker publishes ports **around** `ufw`, so this is the only reliable way to
keep Judge0 off the public internet.

### 4.2 Configure `judge0.conf`

Edit `judge0.conf` and set at least:

```ini
# --- Secrets (generate your own, e.g. openssl rand -hex 32) ---
REDIS_PASSWORD=CHANGE_ME_REDIS
POSTGRES_PASSWORD=CHANGE_ME_POSTGRES

# --- API auth: the portal sends this as X-Auth-Token ---
AUTHN_HEADER=X-Auth-Token
AUTHN_TOKEN=CHANGE_ME_JUDGE0_TOKEN

# --- Let /api/run wait for the result in one request ---
ENABLE_WAIT_RESULT=true

# --- Keep the surface small ---
JUDGE0_TELEMETRY_ENABLE=false
ENABLE_SUBMISSION_DELETE=false
ENABLE_BATCHED_SUBMISSIONS=false
ENABLE_CALLBACKS=false
ENABLE_ADDITIONAL_FILES=false
ALLOW_ENABLE_NETWORK=false
ENABLE_NETWORK=false
MAX_QUEUE_SIZE=100

# --- Runtime ceilings the API may request ---
CPU_TIME_LIMIT=5
MAX_CPU_TIME_LIMIT=10
WALL_TIME_LIMIT=10
MAX_WALL_TIME_LIMIT=20
MEMORY_LIMIT=128000
MAX_MEMORY_LIMIT=256000
MAX_FILE_SIZE=1024
MAX_MAX_FILE_SIZE=4096
MAX_PROCESSES_AND_OR_THREADS=60
```

Notes:

- `AUTHN_TOKEN` is the value that goes into `JUDGE0_KEY` in the Next.js app.
  Anyone with it can run code, so treat it as a secret and rotate it if leaked.
- `CPU_TIME_LIMIT` is seconds, `MEMORY_LIMIT` and `MAX_FILE_SIZE` are
  **kilobytes**. The app asks for 5 s CPU, 10 s wall, 128 MB RAM and 64 KB
  files, all inside these ceilings.
- Leaving `ENABLE_WAIT_RESULT=true` lets `/api/run` use `?wait=true`. If wait is
  disabled, `/api/run` cannot read the result in one request and will report the
  service as unavailable.
- Do **not** set `ALLOW_IP`/`DISALLOW_IP` for the portal: Vercel's egress IPs are
  dynamic. The auth token plus HTTPS is the access control.

### 4.3 Start it

```bash
docker compose up -d db redis
sleep 10
docker compose up -d
docker compose ps
```

First start pulls several images; give it a few minutes.

```bash
curl -s http://127.0.0.1:2358/system_info | head -c 300
```

---

## 5. HTTPS reverse proxy

Judge0 must be reachable over HTTPS from Vercel, so terminate TLS in front of
it. **Caddy** is the least work:

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
judge0.example.com {
    reverse_proxy 127.0.0.1:2358
    request_body {
        max_size 1MB
    }
}
```

```bash
sudo systemctl reload caddy
curl -s https://judge0.example.com/system_info | head -c 200
```

<details>
<summary>Nginx alternative</summary>

```nginx
server {
    listen 443 ssl http2;
    server_name judge0.example.com;

    ssl_certificate     /etc/letsencrypt/live/judge0.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/judge0.example.com/privkey.pem;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:2358;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Obtain the certificate with `certbot --nginx -d judge0.example.com`, then
`nginx -t && systemctl reload nginx`.

</details>

---

## 6. Verify the deployment

Replace the token and host below.

```bash
TOKEN=CHANGE_ME_JUDGE0_TOKEN
HOST=https://judge0.example.com

# 1) Auth works
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Auth-Token: $TOKEN" "$HOST/authenticate"      # expect 200

# 2) C++ language id (look for "C++ (GCC 14.1.0)" -> 105 on v1.13.1)
curl -s -H "X-Auth-Token: $TOKEN" "$HOST/languages" | tr ',' '\n' | grep -i -A1 "c++"

# 3) Hello world
curl -s -H "X-Auth-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "language_id": 105,
    "source_code": "#include <iostream>\nint main(){std::cout << \"Habari, Dunia!\\n\";}",
    "compiler_options": "-std=c++17 -Wall",
    "cpu_time_limit": 5,
    "wall_time_limit": 10,
    "memory_limit": 131072,
    "max_file_size": 64
  }' "$HOST/submissions?base64_encoded=false&wait=true"
# expect status.id = 3 and stdout = "Habari, Dunia!"

# 4) Compile error (expect status.id = 6 and compile_output with main.cpp:1)
curl -s -H "X-Auth-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"language_id":105,"source_code":"int main(){ retur 0; }"}' \
  "$HOST/submissions?base64_encoded=false&wait=true"
```

If step 1 returns `401`, the token does not match `AUTHN_TOKEN`. If step 3
returns `500` with *Internal Error*, go back to §3 (cgroup v1).

---

## 7. Point the portal at it

Add the values to `.env.local` (local development) **and** to the Vercel
project (Production/Preview) — never to `NEXT_PUBLIC_*` variables:

```ini
JUDGE0_URL=https://judge0.example.com
JUDGE0_KEY=CHANGE_ME_JUDGE0_TOKEN
# Optional, only if your Judge0 uses a different C++ language id:
# JUDGE0_CPP_LANGUAGE_ID=105
```

Redeploy (or restart `npm run dev`). Until these exist, `/api/run` answers
`503` with a Swahili message telling the student the service is not configured;
the rest of the portal keeps working.

Also apply the run-log migration once (it is additive and already applied to
the hosted project):

```bash
# needs DATABASE_URL in .env.local
node scripts/apply-migration.mjs
```

---

## 8. End-to-end check in the portal

1. Teacher → Assignments → create/edit → add an *Essay*, *Calculation* or
   *Short answer* question → tick **Practical question (C++ IDE)** → save and
   publish.
2. Student → open the assignment → the question shows an **IDE (C++) /
   Maandishi** toggle, defaulting to the IDE.
3. Type code → **Endesha**. Expected: output appears, or the compiler errors
   appear both in the output panel and as red squiggles in Monaco; clicking an
   error jumps to the line.
4. Break the code, run, fix it, run again → **Wasilisha kazi** unlocks only when
   the *current* code has run successfully. Editing after a run re-locks it.
5. Submit and open the submission as the teacher: the answer is the code block.
6. Confirm the rate limit: eleven runs in a minute → the 11th returns *"Umezidi
   kiwango cha kuendesha code…"* (`429`, `Retry-After: 60`).

---

## 9. Operations

```bash
cd judge0-v1.13.1

docker compose logs -f server          # API log
docker compose logs -f worker          # execution log
docker compose restart                 # restart everything
docker compose pull && docker compose up -d   # upgrade images

docker system df                       # disk usage
docker system prune -af                # reclaim space (safe here)
```

- Judge0 keeps no data worth backing up: the Postgres container is an internal
  queue, not the portal database.
- Reboot the VPS after kernel/GRUB changes and re-check `docker info`.
- Rotate `AUTHN_TOKEN` by editing `judge0.conf`, restarting, then updating
  `JUDGE0_KEY` in Vercel.
- Watch CPU/RAM: a 2 GB VPS handles a class of ~30 students running short
  programs; if you see *queue is full* or timeouts, add RAM/CPU before raising
  `MAX_QUEUE_SIZE`.

---

## 10. Troubleshooting

| Symptom in the portal | Likely cause | Fix |
| --- | --- | --- |
| *"Huduma ya kuendesha code haijasanidiwa…"* (503) | `JUDGE0_URL`/`JUDGE0_KEY` missing in that environment | Set them in `.env.local` / Vercel and redeploy |
| *"Huduma ya kuendesha code haipatikani kwa sasa…"* (503) | VPS down, DNS/TLS broken, wrong URL, 401 from Judge0, or `wait` disabled | `curl` §6 from your laptop; check `docker compose ps` and `docker compose logs server` |
| Every run is *Internal Error* | cgroup v2, or isolate cannot create the sandbox | Re-check §3 |
| *Time limit exceeded* on trivial code | `CPU_TIME_LIMIT` too low in `judge0.conf` or the VPS is overloaded | Raise the ceiling; check load with `htop` |
| *Compilation error* with no message | Output truncated or empty | Run the same code with the `curl` in §6 |
| 11th run blocked | Expected: 10 runs/minute/student | Wait 60 s; the counter is in `code_runs` |
| Student sees the plain textarea instead of Monaco | CDN blocked/slow, or offline | Monaco falls back automatically; check the browser network tab |
| 413 from `/api/run` | Code or stdin above 64 KB | Expected limit |
| *"Swali hili si la practical…"* (400) | Question is not marked practical, or is MCQ/matching/structured | Tick the practical box on a text-answer question |

Server-side logs to check on Vercel: `code_runs insert failed: …` means the
migration is missing; `Judge0 returned HTTP 401` means the token is wrong.

---

## 11. Security checklist

- [ ] Judge0 port `2358` bound to `127.0.0.1` only (not `0.0.0.0`).
- [ ] HTTPS with a valid certificate; HTTP redirects to HTTPS.
- [ ] `AUTHN_TOKEN` is long, random and stored only in server env vars.
- [ ] `JUDGE0_*` variables are **not** prefixed with `NEXT_PUBLIC_`.
- [ ] `ENABLE_NETWORK=false` and `ALLOW_ENABLE_NETWORK=false`.
- [ ] Rate limit (10/min) and 64 KB code/output caps active in `/api/run`.
- [ ] Code is never logged by the portal (only status/time/memory in
      `code_runs`).
- [ ] VPS is dedicated to Judge0 and patched monthly
      (`apt upgrade`, `docker compose pull`).
