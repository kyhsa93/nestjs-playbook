#!/usr/bin/env bash
# verify-golden.sh — baseline + golden src overlay 후 harness로 평가하여
# golden 제출물이 목표 점수 이상을 받는지 확인한다 (harness 자체 회귀 방어).
#
# Usage:
#   scripts/verify-golden.sh <category/taskId> [--min-score N]
# Example:
#   scripts/verify-golden.sh new-domain/domain-module-basic --min-score 90

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <category/taskId> [--min-score N]" >&2
  exit 1
fi

TASK_ID="$1"
shift
MIN_SCORE=90
while [[ $# -gt 0 ]]; do
  case "$1" in
    --min-score) MIN_SCORE="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASELINE="$HARNESS_ROOT/baseline"
GOLDEN="$HARNESS_ROOT/golden/$TASK_ID"
TASK_ROOT="$HARNESS_ROOT/tasks/$TASK_ID"

if [[ ! -d "$GOLDEN" ]]; then
  echo "golden not found: $GOLDEN" >&2
  exit 1
fi
if [[ ! -d "$TASK_ROOT" ]]; then
  echo "task not found: $TASK_ROOT" >&2
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
WORKDIR="$HARNESS_ROOT/sandbox/golden-$(echo "$TASK_ID" | tr '/' '_')-${TIMESTAMP}"
mkdir -p "$WORKDIR"

rsync -a --exclude 'node_modules' --exclude 'dist' --exclude 'coverage' "$BASELINE/" "$WORKDIR/"
rsync -a "$GOLDEN/src/" "$WORKDIR/src/"

REPORT_FILE="$WORKDIR/RESULT.json"
(
  cd "$HARNESS_ROOT"
  npx tsx evaluators/cli/run.ts "$TASK_ROOT" "$WORKDIR" --out="$REPORT_FILE"
)

TOTAL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT_FILE','utf-8')).totalScore)")
echo "golden score: $TOTAL (min: $MIN_SCORE)"

if [[ "$TOTAL" -lt "$MIN_SCORE" ]]; then
  echo "REGRESSION: golden fell below threshold" >&2
  cat "$REPORT_FILE"
  exit 1
fi

echo "OK"
