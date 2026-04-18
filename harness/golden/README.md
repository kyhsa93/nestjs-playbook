# Golden Solutions

각 task에 대한 "정답" 샘플 제출물. 용도:

1. **Harness 자체 검증** — golden 제출물을 harness에 넣었을 때 totalScore가 90점 이상이어야 한다. 그렇지 않다면 harness가 규칙을 과하게 강제하고 있거나 golden이 규칙 위반을 담고 있다.
2. **에이전트 학습 레퍼런스** — 태스크 수행 중 참고할 수 있는 예시(단, 태스크 수행 단계에서 agent에게 직접 제공하지는 않는다 — 평가 공정성).
3. **회귀 기준선** — harness 변경 후 golden 점수가 떨어지면 regression.

## 구조

```
golden/
  <category>/<taskId>/
    src/              (정답 제출물 — baseline 위에 src를 override)
    README.md         (해당 solution이 보여주는 패턴 메모)
```

## 검증

```bash
# harness 자체 검증 (baseline + golden src 합친 후 evaluate)
scripts/verify-golden.sh new-domain/domain-module-basic
```
