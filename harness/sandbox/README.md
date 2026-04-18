# Sandbox

에이전트가 작업하는 격리된 작업 공간. 각 실행(run)은 여기에 고유 서브디렉토리를 생성하며, 평가 완료 후 삭제/아카이브된다.

디렉토리 구조:

```
sandbox/
  <agent>-<taskId-slug>-<timestamp>/
    src/             (baseline 복사본 + 에이전트 작업 결과)
    task/            (원본 task.md + assertions 사본 — 프롬프트 구성용)
    RESULT.json      (harness 평가 리포트)
    AGENT_LOG.txt    (에이전트 stdout/stderr)
```

위 디렉토리는 `scripts/prepare-sandbox.sh`로 생성되며 `.gitignore`로 인해 커밋되지 않는다.
