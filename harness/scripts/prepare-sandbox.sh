#!/usr/bin/env bash
# prepare-sandbox.sh — baseline을 sandbox 서브디렉토리에 복사하고 task 파일을 배치한다.
#
# Usage:
#   scripts/prepare-sandbox.sh <agent> <taskRoot>
# Outputs:
#   prints the created sandbox directory absolute path to stdout.
#
# The caller (agent runner) uses the printed path as working directory.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <agent> <taskRoot>" >&2
  exit 1
fi

AGENT="$1"
TASK_ROOT="$2"

if [[ ! -d "$TASK_ROOT" ]]; then
  echo "task root not found: $TASK_ROOT" >&2
  exit 1
fi

# Resolve harness/ absolute path regardless of invocation cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASELINE="$HARNESS_ROOT/baseline"
SANDBOX_ROOT="$HARNESS_ROOT/sandbox"

# Slug the task id for use in directory name
TASK_SLUG=$(basename "$TASK_ROOT" | tr '/ ' '__')
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SANDBOX_DIR="$SANDBOX_ROOT/${AGENT}-${TASK_SLUG}-${TIMESTAMP}"

mkdir -p "$SANDBOX_DIR"

# Copy baseline (excluding node_modules/dist — baseline .gitignore has them, but we're not using git here)
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude 'coverage' "$BASELINE/" "$SANDBOX_DIR/"

# Copy task artifacts
mkdir -p "$SANDBOX_DIR/task"
cp -R "$TASK_ROOT/." "$SANDBOX_DIR/task/"

echo "$SANDBOX_DIR"
