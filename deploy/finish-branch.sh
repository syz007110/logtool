#!/usr/bin/env bash

set -Eeuo pipefail

# 用法：在功能分支上执行，推送后切回 main、拉取最新，并删除远程+本地分支（无需手动删本地）
#
#   ./deploy/finish-branch.sh
#   ./deploy/finish-branch.sh --no-delete-remote   # 只删本地分支（例如已在网页合并并删除了远程）
#   ./deploy/finish-branch.sh --force              # 本地分支未合并时也强制删除（-D）

GIT_REMOTE="${GIT_REMOTE:-origin}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DELETE_REMOTE="${DELETE_REMOTE:-1}"
FORCE_DELETE="${FORCE_DELETE:-0}"

log() { echo "[$(date '+%F %T')] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Push current branch, switch to main, pull, then delete remote and local branch.

Usage:
  ./deploy/finish-branch.sh              # push, checkout main, pull, delete remote + local
  ./deploy/finish-branch.sh --no-delete-remote   # only delete local branch (remote already removed by MR/PR)
  ./deploy/finish-branch.sh --force       # force delete local branch even if not merged (-D)

Options:
  --no-delete-remote    Do not delete the branch on remote (e.g. after merge via GitHub/GitLab)
  --force               Force delete local branch with -D (use when branch is not merged)
  -h, --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-delete-remote) DELETE_REMOTE=0; shift ;;
    --force) FORCE_DELETE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || die "git not found"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not a git repository"

CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT" == "main" || "$CURRENT" == "master" ]]; then
  die "Current branch is $CURRENT. Switch to your feature branch first."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree has uncommitted changes. Commit or stash first."
fi

log "Pushing branch: $CURRENT"
git push -u "$GIT_REMOTE" "$CURRENT"

log "Checking out $MAIN_BRANCH and pulling latest"
git checkout "$MAIN_BRANCH"
git pull "$GIT_REMOTE" "$MAIN_BRANCH"

if [[ "$DELETE_REMOTE" == "1" ]]; then
  log "Deleting remote branch: $CURRENT"
  git push "$GIT_REMOTE" --delete "$CURRENT"
fi

log "Deleting local branch: $CURRENT"
if [[ "$FORCE_DELETE" == "1" ]]; then
  git branch -D "$CURRENT"
else
  if ! git branch -d "$CURRENT" 2>/dev/null; then
    echo ""
    echo "提示：当前分支尚未合并到 $MAIN_BRANCH。"
    echo "请先到远程仓库（GitHub/GitLab 等）创建合并请求（MR/PR）并完成合并，再运行此脚本删除本地分支。"
    echo "若确定不再需要该分支、要强制删除本地分支，可加 --force 参数："
    echo "  bash deploy/finish-branch.sh --force"
    echo ""
    exit 1
  fi
fi

log "Done. You are on $MAIN_BRANCH; branch $CURRENT has been removed."
