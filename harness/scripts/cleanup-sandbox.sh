#!/usr/bin/env bash
# cleanup-sandbox.sh — 지정한 일(기본 7일) 이상 지난 sandbox 디렉토리를 삭제한다.
#
# Usage:
#   scripts/cleanup-sandbox.sh [--days N]     (default: 7)
#   scripts/cleanup-sandbox.sh --all          (삭제 전 확인 후 전체 제거)

set -euo pipefail

DAYS=7
ALL=0
for arg in "$@"; do
  case "$arg" in
    --days=*) DAYS="${arg#--days=}" ;;
    --all) ALL=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SANDBOX_ROOT="$HARNESS_ROOT/sandbox"

if [[ $ALL -eq 1 ]]; then
  read -p "Remove ALL sandboxes under $SANDBOX_ROOT? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    find "$SANDBOX_ROOT" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +
    echo "all sandboxes removed"
  fi
else
  find "$SANDBOX_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$DAYS" -print -exec rm -rf {} +
fi
