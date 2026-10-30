# Running Cactus on your own server

This takes a fresh Ubuntu LTS box to one or more Cactus sites behind Cloudflare, with
no-downtime updates, automatic rollback when an update will not start, nightly database
backups to Backblaze B2, and Cockpit for keeping an eye on it all.

The moving parts:

- **cactus-host** (this folder). A small service that builds each site, switches traffic
  to the new version once it has proved it works, keeps the last few versions for
  rollback, keeps each site's settings file and wakes each site's scheduled jobs. Your
  site's admin talks to it the way it would talk to Vercel or Netlify.
- **Caddy**, in front of the sites, serving HTTPS to Cloudflare.
- **Postgres 18**, on the same box, so every query is a local one.
- **Cloudflare**, in front of everything, as the CDN and firewall.

Each site gets its own Linux user, two ports (one per slot), its own settings file, its
own release folders and its own database. Nothing below is specific to any one site.
Where you see `shop` or `example.com`, use your own.

Everything is run as root unless it says otherwise.

---

## 1. The box

Ubuntu 24.04 LTS or newer, 16 GB of memory or more. Two disks in RAID 1 if the
provider offers it; the instructions below do not care either way.

```bash
apt update && apt full-upgrade -y
apt install -y unattended-upgrades fail2ban ufw git rclone curl ca-certificates gnupg
dpkg-reconfigure -plow unattended-upgrades
timedatectl set-timezone UTC
```

Give yourself an ordinary user with `sudo`, put your SSH key on it, then turn off
password and root logins in `/etc/ssh/sshd_config.d/00-hardening.conf`:

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
```

`systemctl reload ssh`, and check you can still get in from a second terminal before
closing the first. Being locked out of your own server is a rite of passage best
skipped.

A modest swap file is a cushion against a runaway build, not something to lean on:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf && sysctl --system
```

## 2. Node, Caddy, Postgres, Chrome

First, put cactus-host on the box, since the steps below use files from it. It is the
`cactus-host` folder of Cactus itself, and every Cactus install repository carries a
copy, so take it from yours (or from Cactus's own repository at the version your sites
run):

```bash
git clone --depth 1 https://github.com/<you>/<your-install-repo> /tmp/cactus-src
cp -r /tmp/cactus-src/cactus-host /opt/cactus-host && rm -rf /tmp/cactus-src
```

**Node 24**, from NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
less /tmp/nodesource_setup.sh   # read it before running it
bash /tmp/nodesource_setup.sh && apt install -y nodejs
node -v   # v24.x
```

**Caddy**, from its own repository (instructions at
<https://caddyserver.com/docs/install#debian-ubuntu-raspbian>). Then:

```bash
install -d -m 0755 /etc/caddy/sites
cp /opt/cactus-host/ops/Caddyfile /etc/caddy/Caddyfile
install -D -m 0644 /opt/cactus-host/ops/caddy-runtime-dir.conf /etc/systemd/system/caddy.service.d/runtime-dir.conf
systemctl daemon-reload && systemctl restart caddy
```

**Postgres 18**, from the PostgreSQL project's own repository (instructions at
<https://www.postgresql.org/download/linux/ubuntu/>). Then the settings for a database
that shares its box with the sites it serves:

```bash
cp /opt/cactus-host/ops/postgres-same-box.conf /etc/postgresql/18/main/conf.d/90-cactus-same-box.conf
systemctl restart postgresql
```

One role and one database per site:

```bash
sudo -u postgres createuser --pwprompt shop
sudo -u postgres createdb --owner shop shop
```

The site's connection string is then

```
postgresql://shop:<password>@localhost:5432/shop?connection_limit=10&pool_timeout=20
```

No `sslmode`: the connection never leaves the box. **No PgBouncer, and no
`pgbouncer=true`.** On a serverless host PgBouncer protects Postgres from hundreds of
short-lived instances each opening connections. Here each site is one long-lived process
with its own small pool (two, for a few seconds, during an update), so there is nothing
to protect it from - and `pgbouncer=true` makes Prisma spend about four round trips on
every query. If something else on the box genuinely needs a pooler, give it one of its
own; keep the sites pointed straight at Postgres. `DIRECT_URL` can be left unset, or set
to the same string.

**Google Chrome**, for PDFs (invoices, quotes and the like):

```bash
curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb
apt install -y /tmp/chrome.deb
```

Not Ubuntu's own `chromium`, which is a snap and will not start for a service user. If
Chrome is missing, the site says so plainly when someone tries to print, rather than
falling over.

## 3. cactus-host

The folder is already in `/opt/cactus-host` from step 2. Install it:

```bash
install -m 0755 /opt/cactus-host/ops/cactus-host.sh /usr/local/bin/cactus-host
install -d -m 0700 /etc/cactus-host /etc/cactus-host/keys
cp /opt/cactus-host/ops/config.example.json /etc/cactus-host/config.json
nano /etc/cactus-host/config.json   # your server's public IP, the origin certificate
cp /opt/cactus-host/ops/cactus-host.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now cactus-host
journalctl -u cactus-host -n 20   # "listening on 127.0.0.1:7171 for 0 site(s)"
```

Every key in `config.json` is optional; `config.ts` lists them with their defaults. The
ones worth a look:

| Key | Default | What it does |
| --- | --- | --- |
| `publicAddress` | none | Shown in the setup wizard's DNS step. |
| `tls` | none | The default Cloudflare origin certificate. Without one, Caddy fetches certificates itself, which does not work behind Cloudflare's proxy. |
| `keepReleases` | 5 | Versions kept per site for rollback, the live one included. |
| `build.cpuQuota` | `400%` | Four cores' worth for a build, at most. |
| `build.memoryMax` | `6G` | A build that wants more is stopped, rather than the box. |
| `site.memoryMax` | `3G` | Per running site. |

Builds also run at low CPU and disk priority, so a build in progress never slows the
live sites or Postgres down noticeably.

## 4. Firewall

SSH from anywhere (or from your own address only, if it is fixed), HTTPS from Cloudflare
only, nothing else:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
sh /opt/cactus-host/ops/cloudflare-ufw.sh
ufw enable
```

Port 80 stays closed: Cloudflare talks to the box over HTTPS only (step 6).

## 5. Cockpit

Cockpit gives you a web view of services, logs, disks and memory.

```bash
apt install -y cockpit
```

Keep it off the public internet. It listens on port 9090, which the firewall above does
not open, so reach it through SSH:

```bash
ssh -L 9090:localhost:9090 you@your-server
```

then open <https://localhost:9090> and sign in as your ordinary user. Root cannot sign in
to Cockpit by default, which is as it should be.

Worth knowing where things show up in it:

- **Services**: `cactus-host`, and two per site, `cactus-<site>-a` and `cactus-<site>-b`.
  One of the pair is running at any time; the other is the previous version, stopped,
  ready to come back if you roll back. A build shows up briefly as
  `cactus-build-<site>-…`.
- **Logs**: filter by any of those names.

Do not start, stop or enable the site units from Cockpit while a build is running.
cactus-host decides which slot is live, and will be confused if somebody else does.

## 6. Cloudflare

For each domain:

1. **DNS**: an `A` record for the domain (and `www`, if you use it) pointing at the
   server's public address, **proxied** (orange cloud).
2. **SSL/TLS → Overview**: set the mode to **Full (strict)**.
3. **SSL/TLS → Origin Server → Create Certificate**: the defaults (RSA, the domain and
   `*.domain`, 15 years) are fine. Save the certificate and key on the server:

   ```bash
   install -d -m 0750 -o root -g caddy /etc/cactus-host/tls
   nano /etc/cactus-host/tls/origin.pem   # paste the certificate
   nano /etc/cactus-host/tls/origin.key   # paste the private key
   chown root:caddy /etc/cactus-host/tls/* && chmod 0640 /etc/cactus-host/tls/*
   ```

   An origin certificate covers one Cloudflare zone. The first goes in cactus-host's
   config as the default (`tls`, step 3); a site on a different domain gets its own with
   `cactus-host site tls <site> <cert> <key>`.

4. In the site's admin, once it is running: **Settings → Speed → behind Cloudflare** on.
   That is what lets rate limits see your visitors' real addresses instead of
   Cloudflare's.

Cloudflare honours the cache headers Cactus already sends (`CDN-Cache-Control`), and the
site's admin can purge Cloudflare's cache the same way it does on any other host.

## 7. Adding a site

```bash
cactus-host site add shop --repo you/shop-site --domain example.com --domain www.example.com --name "The Shop"
```

It prints a deploy key. On GitHub, open the install repository's **Settings → Deploy
keys → Add deploy key**, paste it, and leave **Allow write access** unticked:
cactus-host only ever reads. Then:

```bash
cactus-host build shop
```

The first build takes a few minutes and ends with `Live.`. Visit
`https://example.com/setup` and the setup wizard takes it from there. It already knows
it is on your own server: choose the domain, paste the database connection string from
step 2, and it builds again with everything in place.

The site's Update button, module installs and settings changes all work from then on
exactly as they do on Vercel. An update builds the new version alongside the old one,
checks it starts and can reach its database, switches visitors over, then stops the old
one. If the new version will not start, visitors never see it, and the admin says the
update failed.

## 8. Moving an existing site from Vercel

The site runs on the new box against its own database while the old one carries on, and
you switch over by changing DNS. A few things to get right:

1. **Its settings.** Copy every environment variable from the Vercel project
   **except** `VERCEL_*` and `EDGE_CONFIG`, with `cactus-host env set shop KEY=value`
   (add `--secret` for anything secret). Vercel will not show you a secret value once
   saved, so these come from wherever you kept them. `ENCRYPTION_KEY` must be **exactly**
   the old value, or the site cannot read the credentials it stored encrypted. If nobody
   kept it, change it first on the old site (**Settings → General → Encryption key**,
   up to and including the rotation step) - that leaves you holding the new key, which
   is the one to set here. Do not set `ENCRYPTION_KEY_NEXT` on the new box.
   `SESSION_SECRET` may change; everybody simply signs in again.
2. **Its database** points at the new one: `DATABASE_URL` as in step 2, and `DIRECT_URL`
   unset or the same.
3. **Build and look at it before DNS moves.** `cactus-host build shop`, then point your
   own computer at the box with a line in its hosts file
   (`<server address> example.com`) and click about.
4. **Only one copy may run scheduled jobs.** Two sites on one database would each run
   every job: two invoice emails, two stock imports. Before the new site's first build
   with a real `CRON_SECRET`, switch off the Vercel project's scheduled jobs (its Cron
   Jobs settings), or take that deployment down. Once DNS has moved and you are happy,
   disconnect the Vercel project's Git repository too, so Cactus's own commits stop
   building there.
5. **Switch DNS** in Cloudflare to the new address, proxied. Because Cloudflare sits in
   front, the change is near enough instant for visitors.

## 9. Backups

Two layers, and you want both:

- **The site's own backup** (admin → Settings → Backups) makes a file you can restore
  into any Cactus site, anywhere.
- **Nightly dumps of every database on the box**, kept for a week locally and copied to
  B2:

  ```bash
  rclone config   # a remote called "b2", type "b2" (the native backend, not S3)
  install -m 0755 /opt/cactus-host/ops/backup-postgres.sh /usr/local/bin/backup-postgres.sh
  cp /opt/cactus-host/ops/cactus-postgres-backup.service /opt/cactus-host/ops/cactus-postgres-backup.timer /etc/systemd/system/
  nano /etc/systemd/system/cactus-postgres-backup.service   # your bucket and folder
  systemctl daemon-reload && systemctl enable --now cactus-postgres-backup.timer
  systemctl start cactus-postgres-backup   # once now, to see it work
  ```

  Restore one with `pg_restore --clean --if-exists -d <db> <file>.dump`, as `postgres`.
  Try it once on a scratch database before you need it in anger: a backup nobody has
  restored is a hope, not a backup.

If your provider offers snapshots of the whole server, keep them for the small hours,
well away from 03:30.

## 10. Day to day

```bash
cactus-host site list               # every site, its ports and what is live
cactus-host builds shop             # recent builds; * marks the live one
cactus-host logs shop               # the newest build's log
cactus-host build shop              # build the latest commit now
cactus-host rollback shop           # back to the previous version, no build needed
cactus-host rollback shop <build>   # or a particular one
cactus-host env list shop
journalctl -u cactus-shop-a -f      # the site's own output (or -b)
```

Settings changed with `cactus-host env set` reach the site with its next build, exactly
as on Vercel. A running version always keeps the settings it was built with, so a
restart never changes anything by surprise.

**Updating cactus-host itself**: copy the new `cactus-host` folder over `/opt/cactus-host`,
then `systemctl restart cactus-host` (it waits for any build in progress) and
`cactus-host site refresh <site>` for each site, which rewrites its units and Caddy file.
The running slots pick up unit changes on their next restart, which the next build gives
them.

## 11. Other services on the same box

Anything else you run here (a message broker, a worker) is best given its own systemd
unit with a `MemoryMax`, so it cannot take the sites down with it, and its own Linux
user. Nothing about Cactus needs to know.

## Where things live

| What | Where |
| --- | --- |
| cactus-host | `/opt/cactus-host`, config in `/etc/cactus-host/config.json` |
| Its records, build logs, code mirrors | `/var/lib/cactus-host` (root only) |
| Deploy keys | `/etc/cactus-host/keys` (root only) |
| A site's files | `/srv/cactus/<site>/` |
| A site's settings | `/srv/cactus/<site>/env` (that site's user only) |
| A site's versions | `/srv/cactus/<site>/releases/<build>/` |
| A site's Caddy file | `/etc/caddy/sites/<site>.caddy` (rewritten by cactus-host) |
| Its services | `cactus-<site>-a`, `cactus-<site>-b` |
