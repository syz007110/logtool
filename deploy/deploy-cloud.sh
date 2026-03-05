#!/usr/bin/env bash

set -Eeuo pipefail

# Usage:
#   ./deploy/deploy-cloud.sh
#   ./deploy/deploy-cloud.sh --branch main --with-nginx
#
# Optional env vars:
#   APP_DIR=/www/server/logtool
#   GIT_REMOTE=origin
#   GIT_BRANCH=main
#   PM2_APP_NAME=logtool-cluster
#   DEPLOY_TARGET=all
#   RELOAD_NGINX=0
#   ALLOW_DIRTY=0
#   HEALTHCHECK_URL=http://127.0.0.1/health

APP_DIR="${APP_DIR:-/www/server/logtool}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-logtool-cluster}"
DEPLOY_TARGET="${DEPLOY_TARGET:-all}"
RELOAD_NGINX="${RELOAD_NGINX:-0}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1/health}"

log() {
  echo "[$(date '+%F %T')] $*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Cloud deploy script for LogTool.

Options:
  --app-dir <path>      Project directory on server
  --branch <name>       Git branch to deploy
  --remote <name>       Git remote name (default: origin)
  --pm2-name <name>     PM2 app name in ecosystem.config.js
  --target <value>      Frontend target: all|web|mobile (default: all)
  --with-nginx          Validate and reload nginx
  --allow-dirty         Allow deploying with local git changes
  -h, --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --branch)
      GIT_BRANCH="$2"
      shift 2
      ;;
    --remote)
      GIT_REMOTE="$2"
      shift 2
      ;;
    --pm2-name)
      PM2_APP_NAME="$2"
      shift 2
      ;;
    --target)
      DEPLOY_TARGET="$2"
      shift 2
      ;;
    --with-nginx)
      RELOAD_NGINX=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

for cmd in git node npm pm2; do
  command -v "$cmd" >/dev/null 2>&1 || die "Missing command: $cmd"
done

case "$DEPLOY_TARGET" in
  all|web|mobile)
    ;;
  *)
    die "Invalid --target: $DEPLOY_TARGET (expected: all|web|mobile)"
    ;;
esac

[[ -d "$APP_DIR" ]] || die "APP_DIR not found: $APP_DIR"
cd "$APP_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not a git repo: $APP_DIR"

if [[ "$ALLOW_DIRTY" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree has local changes. Commit/stash first, or pass --allow-dirty."
fi

log "Fetching latest code from $GIT_REMOTE/$GIT_BRANCH"
git fetch "$GIT_REMOTE" --prune
git checkout "$GIT_BRANCH"
git pull --ff-only "$GIT_REMOTE" "$GIT_BRANCH"

install_deps() {
  local dir="$1"
  log "Installing dependencies in $dir"
  cd "$APP_DIR/$dir"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}

install_deps backend
install_deps frontend

cd "$APP_DIR/frontend"
if [[ "$DEPLOY_TARGET" == "all" || "$DEPLOY_TARGET" == "web" ]]; then
  log "Building frontend web package"
  npm run build:web
fi

if [[ "$DEPLOY_TARGET" == "all" || "$DEPLOY_TARGET" == "mobile" ]]; then
  log "Building frontend mobile package"
  npm run build:mobile
fi

log "Ensuring backend log directory exists"
mkdir -p "$APP_DIR/backend/logs"

log "Restarting backend with PM2: $PM2_APP_NAME"
cd "$APP_DIR"
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" --update-env
else
  pm2 start ecosystem.config.js --only "$PM2_APP_NAME" --update-env
fi
pm2 save

if [[ "$RELOAD_NGINX" == "1" ]]; then
  log "Validating and reloading nginx"
  sudo nginx -t
  sudo systemctl reload nginx
fi

if command -v curl >/dev/null 2>&1; then
  log "Running backend healthcheck: $HEALTHCHECK_URL"
  curl -fsS --max-time 10 "$HEALTHCHECK_URL" >/dev/null \
    && log "Healthcheck passed" \
    || log "Healthcheck failed (non-blocking)"
fi

log "Deploy completed successfully."
