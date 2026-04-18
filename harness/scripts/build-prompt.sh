#!/usr/bin/env bash
# build-prompt.sh — sandbox 안에서 에이전트에게 전달할 프롬프트를 stdout에 출력.
#
# Usage:
#   scripts/build-prompt.sh <sandboxDir> [--round N] [--previous-report <path>]
#
# 프롬프트 구성:
#   - task.md 전문
#   - assertions/*.json 요약
#   - 규칙: 작업 결과를 src/ 아래에 저장, 완료 후 출력하지 말 것
#   - self-correction 라운드인 경우 이전 실패 항목 첨부

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <sandboxDir> [--round N] [--previous-report <path>]" >&2
  exit 1
fi

SANDBOX_DIR="$1"
shift
ROUND=1
PREVIOUS_REPORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --round) ROUND="$2"; shift 2 ;;
    --previous-report) PREVIOUS_REPORT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

TASK_DIR="$SANDBOX_DIR/task"
TASK_MD="$TASK_DIR/task.md"

if [[ ! -f "$TASK_MD" ]]; then
  echo "task.md not found at $TASK_MD" >&2
  exit 1
fi

cat <<EOF
You are an autonomous coding agent completing a task in this NestJS project.

Working directory: $SANDBOX_DIR
Round: $ROUND

Project guide:
- docs are under ../../docs/ relative to sandbox (read-only context).
- CLAUDE.md at project root lists per-concern doc files.
- The starting point is a minimal NestJS baseline already present under src/.

Instructions:
1. Read task/task.md fully.
2. Consult task/assertions/*.json for structural/architectural requirements.
3. Make file edits only inside src/ (and test/ if tests are required).
4. Do NOT run npm install or touch node_modules.
5. When done, exit silently. The harness will evaluate your output.

=== TASK ===
$(cat "$TASK_MD")

=== ASSERTIONS ===
$(for f in "$TASK_DIR"/assertions/*.json; do
  echo "-- $(basename "$f") --"
  cat "$f"
  echo
done)
EOF

if [[ -n "$PREVIOUS_REPORT" && -f "$PREVIOUS_REPORT" ]]; then
  cat <<EOF

=== PREVIOUS ROUND FAILURES (you must fix these) ===
$(cat "$PREVIOUS_REPORT")
EOF
fi
