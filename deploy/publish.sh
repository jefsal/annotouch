#!/usr/bin/env bash
# Run after npm run build, as your normal user (sudo is used only for publishing).
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
test -f dist/index.html || { echo 'Run npm run build first.' >&2; exit 1; }
release="$(date -u +%Y%m%dT%H%M%S%N)-$(git rev-parse --short HEAD)"
release_dir="/var/www/annotouch/releases/$release"
sudo install -d -m 755 "$release_dir"
sudo cp -R dist/. "$release_dir/"
# Preserve older hashed assets for open tabs that have not loaded the exporter yet.
if [[ -d /var/www/annotouch/current/assets ]]; then
    sudo cp -Rn /var/www/annotouch/current/assets/. "$release_dir/assets/"
fi
sudo chmod -R a+rX "$release_dir"
# Use a unique temporary link so concurrent/stale runs cannot redirect cp/mv.
next_link="/var/www/annotouch/.current-$release"
sudo ln -s "releases/$release" "$next_link"
sudo mv -Tf "$next_link" /var/www/annotouch/current
printf 'Published %s\n' "$release_dir"
