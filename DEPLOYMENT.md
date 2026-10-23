# Annotouch deployment

Public hostname: **https://annotouch.jefsal.com**. No Cloudflare Access login is
planned. The root domain does not need a website; its Cloudflare DNS zone must
be active.

Node/npm build static files in `dist/`. Caddy serves the files on
`127.0.0.1:8080`, and cloudflared connects that listener to Cloudflare. Only Caddy
and cloudflared run continuously. PDFs stay in visitors' browsers; this server
has no application backend, uploads, or database.

## Build

From the repository root, as your normal user:

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Node requirements and browser testing instructions are in CONTRIBUTING.md.
Do not run npm as root or use Vite dev/preview as the production server.

## Install the host services (requires your sudo password)

From the repository root:

```sh
bash deploy/setup-host.sh
```

Review the script before running it. It installs Ubuntu's Caddy package, adds
[Cloudflare's signed stable APT repository](https://pkg.cloudflare.com/), installs
cloudflared, publishes the built files, backs up and replaces `/etc/caddy/Caddyfile`,
and enables Caddy at boot. It does not configure the tunnel or accept any token.
If Caddy is already serving other sites, merge our site block into its config
instead of running this single-site installer unchanged.

The Caddyfile binds only to loopback, accepts the public Host header forwarded
by Cloudflare, compresses responses, revalidates HTML, and caches hashed assets.
It supplies a JavaScript MIME type for PDF.js `.mjs` workers. Missing files return
404; the current application needs no SPA URL fallback. The live root is
`/var/www/annotouch/current`, never the source repository.

The installation uses the Ubuntu-maintained Caddy package. Keep Ubuntu security
updates enabled. Upstream also offers an [official Caddy package repository](https://caddyserver.com/docs/install).

## Connect your Cloudflare account

Follow [Cloudflare's current tunnel setup](https://developers.cloudflare.com/tunnel/get-started/):

1. In the dashboard, open Networking → Tunnels (or Cloudflare One → Networks →
   Tunnels, depending on the dashboard layout).
2. Create a remotely managed Cloudflared tunnel named `annotouch`, or reuse an
   existing connector on this machine. Do not overwrite an existing cloudflared
   service belonging to another tunnel.
3. Select **Debian/Ubuntu Linux, amd64/x86-64**. The package is already installed
   by our host script. Run the dashboard's `sudo cloudflared service install ...`
   command in your own terminal. It contains a secret token: do not paste it in
   chat or commit it. Avoid saving that command in shell history.
4. Ensure the service runs on boot:

   ```sh
   sudo systemctl enable --now cloudflared
   systemctl is-active caddy cloudflared
   ```

5. Add a published application route:
   - Subdomain: `annotouch`
   - Domain: `jefsal.com`
   - Path: leave blank
   - Service type: `HTTP`
   - Service URL: `127.0.0.1:8080`
6. Let Cloudflare create the tunnel DNS record. If `annotouch` already has a
   conflicting A, AAAA, or CNAME record, inspect that record before replacing it.
7. Do not add an Access login requirement; the site is intended to be public.
   Check that an existing wildcard Access policy does not cover this hostname.

Cloudflare handles public HTTPS. Caddy uses HTTP on local loopback, so no local
TLS certificate or Caddy DNS plugin is needed. This assumes cloudflared runs
on the host, not inside Docker. No router port forwarding or static public IP
is needed. Allow outbound port 7844 (UDP for QUIC or TCP for HTTP/2), DNS, and
HTTPS for setup/updates.

## Verify

```sh
curl -I -H 'Host: annotouch.jefsal.com' http://127.0.0.1:8080/
curl -I https://annotouch.jefsal.com/
systemctl is-enabled caddy cloudflared
```

Open the public site from mobile data, load a PDF, draw, add text, and export.
Check that the JS/CSS and PDF worker load without console errors. A missing asset
must return 404. Avoid Cloudflare rules that indefinitely cache HTML.

Confirm recovery after reboot and Internet interruptions. Disable automatic
suspension and configure BIOS power restoration if desired. Home power or
Internet outages make the site unavailable.

## Update and rollback

```sh
git pull --ff-only
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
bash deploy/publish.sh
```

Publishing creates a new release, retains old hashed assets for already-open
tabs, and atomically switches the `current` symlink. Caddy does not need a restart
for content updates. Keep the previous release. To roll back, substitute its
actual directory name below:

```sh
sudo ln -s releases/PREVIOUS_RELEASE /var/www/annotouch/rollback.next
sudo mv -Tf /var/www/annotouch/rollback.next /var/www/annotouch/current
```

For Caddy config changes, validate with `sudo caddy validate --config
/etc/caddy/Caddyfile`, then `sudo systemctl reload caddy`. Keep service packages
updated with APT. Old release directories and retained assets accumulate; prune
them deliberately after deciding how long to support old browser tabs.

Diagnostics: `journalctl -u caddy` and `journalctl -u cloudflared`. Keep tokens
private when sharing output. For a public 502, check the local URL and service
status first. Back up service configuration and release artifacts; there is no
server-side PDF database to back up.
