#!/usr/bin/env bash
# run-codex.sh — Codex CLI로 태스크를 수행한다.
#
# Usage:
#   scripts/run-codex.sh <taskRoot> [--rounds N]
#
# 절차:
#   1. prepare-sandbox.sh로 baseline + task 사본이 담긴 sandbox 생성
#   2. build-prompt.sh로 프롬프트 구성
#   3. codex exec 로 non-interactive 실행.
#   4. evaluator CLI로 점수 측정. 결과를 sandbox에 저장.
#   5. --rounds N이면 실패 항목을 agent에게 돌려주며 반복.
#
# 요구사항:
#   - `codex` CLI가 PATH에 있어야 함 (https://github.com/openai/codex)
#   - OPENAI_API_KEY가 환경에 설정되어 있어야 함

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <taskRoot> [--rounds N]" >&2
  exit 1
fi

TASK_ROOT="$1"
shift
ROUNDS=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rounds) ROUNDS="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v codex >/dev/null 2>&1; then
  echo "error: 'codex' CLI not found. Install from https://github.com/openai/codex" >&2
  exit 127
fi

SANDBOX_DIR="$("$SCRIPT_DIR/prepare-sandbox.sh" codex "$TASK_ROOT")"
echo "sandbox: $SANDBOX_DIR"

PREVIOUS_REPORT=""
for ((round=1; round<=ROUNDS; round++)); do
  echo "=== round $round/$ROUNDS ==="
  PROMPT="$("$SCRIPT_DIR/build-prompt.sh" "$SANDBOX_DIR" --round "$round" ${PREVIOUS_REPORT:+--previous-report "$PREVIOUS_REPORT"})"

  # Codex CLI 실행
  # codex exec: non-interactive (프롬프트 실행 후 종료)
  # -C: 작업 디렉토리 지정
  # --sandbox workspace-write: sandbox 내에서만 쓰기 허용
  # --ask-for-approval never: 자동 승인
  (
    printf '%s' "$PROMPT" | codex exec \
      -C "$SANDBOX_DIR" \
      --sandbox workspace-write \
      --ask-for-approval never \
      > "$SANDBOX_DIR/AGENT_LOG.txt" 2>&1 || true
  )

  # 평가 실행
  REPORT_FILE="$SANDBOX_DIR/RESULT-round${round}.json"
  (
    cd "$HARNESS_ROOT"
    npx tsx evaluators/cli/run.ts "$TASK_ROOT" "$SANDBOX_DIR" --out="$REPORT_FILE" || true
  )

  TOTAL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT_FILE','utf-8')).totalScore)")
  echo "round $round score: $TOTAL"

  if [[ "$TOTAL" -ge 90 ]]; then
    echo "converged at round $round"
    break
  fi
  PREVIOUS_REPORT="$REPORT_FILE"
done

ln -sf "$REPORT_FILE" "$SANDBOX_DIR/RESULT.json"
echo "final report: $SANDBOX_DIR/RESULT.json"
