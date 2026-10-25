#!/usr/bin/env bash
# Install the original-UI/Grok app. Existing runtime data is never reset.
set -euo pipefail

dest="${HOME}/.ohmydots"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) [ "$#" -ge 2 ] || { echo 'Missing --dir value' >&2; exit 1; }; dest="$2"; shift 2 ;;
    --help|-h) echo 'OhMyDots installer: bash install.sh [--dir /absolute/path]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
case "$dest" in /*) ;; *) echo '--dir must be an absolute path.' >&2; exit 1 ;; esac
for binary in git node npm; do
  command -v "$binary" >/dev/null || { echo "Required: $binary" >&2; exit 1; }
done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<24||(a===24&&b<15))process.exit(1)' || { echo 'Node.js 24.15+ is required.' >&2; exit 1; }
repo='https://github.com/hyuntroll/oh-my-dots.git'
if [ -e "$dest" ]; then
  [ -d "$dest/.git" ] || { echo 'Destination is not a Git checkout; choose another path.' >&2; exit 1; }
  [ "$(git -C "$dest" remote get-url origin)" = "$repo" ] || { echo 'Destination has a different remote.' >&2; exit 1; }
  [ "$(git -C "$dest" branch --show-current)" = main ] || { echo 'Switch the destination checkout to main first.' >&2; exit 1; }
  [ -z "$(git -C "$dest" status --porcelain)" ] || { echo 'Save local changes before updating; no files were reset.' >&2; exit 1; }
  [ ! -f "$dest/.local/hosting/server.pid" ] || { echo 'Stop the previous OhMyDots server before replacing it.' >&2; exit 1; }
  git -C "$dest" pull --ff-only </dev/null
else
  git clone --branch main "$repo" "$dest" </dev/null
fi
cd "$dest"
npm ci </dev/null
npm run setup </dev/null
printf '\nOhMyDots is ready. Start it with:\n  cd %q\n  npm start\n\nComputer: npm run computer:start\nURL: http://127.0.0.1:3420/original/webview/\n' "$dest"
