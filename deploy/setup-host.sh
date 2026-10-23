#!/usr/bin/env bash
# Run as your normal user; sudo prompts in your terminal where needed.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
test -f dist/index.html || { echo 'Run npm ci && npm run build first.' >&2; exit 1; }
sudo -v
sudo apt-get update
sudo apt-get install -y caddy curl ca-certificates
# Cloudflare's signed stable package repository: https://pkg.cloudflare.com/
key_file=$(mktemp)
trap 'rm -f "$key_file"' EXIT
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o "$key_file"
sudo install -D -m 644 "$key_file" /usr/share/keyrings/cloudflare-main.gpg
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' |
    sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
sudo apt-get update
sudo apt-get install -y cloudflared
bash deploy/publish.sh
sudo caddy validate --config "$repo_dir/deploy/Caddyfile" --adapter caddyfile
# Preserve any previous Caddy config before replacing it with this site's config.
if sudo test -f /etc/caddy/Caddyfile; then
    sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup-$(date -u +%Y%m%dT%H%M%S%N)"
fi
sudo install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl --fail --silent --show-error -I -H 'Host: annotouch.jefsal.com' http://127.0.0.1:8080/
printf '\nCaddy is ready. Connect cloudflared using the Cloudflare dashboard; see DEPLOYMENT.md.\n'
