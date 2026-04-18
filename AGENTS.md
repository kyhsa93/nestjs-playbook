# AGENTS.md

## 이 문서는 누가 읽는가

| 문서 | 독자 | 목적 |
|------|------|------|
| **`CLAUDE.md`** | 사람 개발자 + 대화형 에이전트 | 작업/키워드 → 어느 문서를 읽을지 찾는 인덱스 |
| **`AGENTS.md`** (이 문서) | 자동 에이전트 런타임 (harness runner, benchmark 등) | sandbox 기반 실행 파이프라인의 입출력 계약 |
| **`harness/CONTRIBUTING.md`** | 규칙 / 평가기 기여자 | 새 evaluator·task·fixture 추가 방법 |

즉 **대화형으로 에이전트와 작업**한다면 `CLAUDE.md`부터 읽으면 되고, **harness 파이프라인으로 에이전트를 자동 실행**하는 운영자라면 이 문서가 해당 런북이다.

---

이 저장소에서 **자동 에이전트(Claude Code, Codex 등)**로 작업할 때 읽는 런북이다. 사람이 읽는 [CLAUDE.md](./CLAUDE.md)가 대화형 개발자 온보딩이라면, 이 문서는 **에이전트가 태스크를 받아 실행하는 파이프라인**의 계약을 정의한다.

## 에이전트의 역할

1. 하네스가 sandbox 디렉토리에 baseline NestJS 프로젝트 + `task/` 사본을 배치해둔다.
2. 에이전트는 sandbox를 cwd로 받아 `task/task.md`와 `task/assertions/*.json`을 읽고 요구사항을 파악한다.
3. `src/` (필요 시 `test/`) 안에서 파일을 생성·수정한다.
4. 완료 후 조용히 종료한다. 하네스가 이어받아 평가 리포트를 생성한다.

## 입력 계약

에이전트가 실행되는 시점에 sandbox에는 다음이 있다.

| 경로 | 의미 |
|------|------|
| `package.json`, `tsconfig.json`, `jest.config` 등 | baseline 프로젝트 설정 |
| `src/main.ts`, `src/app-module.ts` | 진입점 (수정 가능하지만 과제에서 요구하지 않으면 유지) |
| `src/database/`, `src/common/`, `src/config/` | 공용 인프라 (일반적으로 유지) |
| `task/task.md` | 과제 명세 |
| `task/assertions/*.json` | 구조·아키텍처·API 제약 |

`docs/`는 sandbox 안에 없지만 **상위 디렉토리에서 읽기 허용**된다 (`--add-dir` 플래그). 에이전트는 필요 시 `../../docs/architecture/*.md`를 참조한다. 진입점 매핑은 [CLAUDE.md](./CLAUDE.md)의 표를 따른다.

## 출력 계약

- 최종 상태의 `src/` (와 필요 시 `test/`)가 평가 대상.
- 콘솔 출력은 `AGENT_LOG.txt`에 기록된다. 평가에 반영되지는 않지만 디버깅용으로 유용.
- 추가 파일을 만들어도 무방하나 `src/` 바깥이면 평가에 반영되지 않는다.
- `node_modules/`·`dist/`·`coverage/`는 건드리지 말 것.

## 금지 사항

- `npm install` / `npm ci` 실행 — baseline이 이미 필요한 의존성을 선언한다.
- 외부 네트워크 호출 (sandbox 격리 가정).
- `docs/`, `harness/`, `CLAUDE.md`, `AGENTS.md`, 기타 프로젝트 루트 파일 수정.
- 비밀(토큰, 키)을 하드코딩. 필요하면 `process.env.*` 사용.

## 규칙 준수 체크리스트

에이전트가 구현 중 반드시 고려할 기계적 규칙 (하네스가 실제로 검증):

- 4레이어 구조 (`domain/`, `application/`, `interface/`, `infrastructure/`) 준수.
- Repository는 Domain 레이어에 `abstract class`로 정의, 구현체는 Infrastructure.
- `@Injectable`, `@Module`, `HttpException` 등 NestJS 심볼은 Domain 레이어에 넣지 않음.
- Task Queue를 사용할 경우: Task Controller는 `interface/`의 `*-task-controller.ts`, Scheduler는 `infrastructure/`의 `*-scheduler.ts`.
- `@Cron` 메서드는 try-catch + `logger.error`. Scheduler 자체는 `TaskQueue.enqueue`만 호출.
- `taskType` 문자열은 전역 유일.
- AppModule에 `ScheduleModule.forRoot()`·`TaskQueueModule` 등록.
- Repository 구현체/Query 구현체는 `-impl.ts` suffix.
- Controller 경로에 `create`, `get`, `update`, `delete`, `set`, `add`, `remove` 같은 **동사 prefix 금지**.
- DTO에 `@ApiProperty`·`@IsString` 등 class-validator 데코레이터.

전체 기계 검증 목록은 [harness/evaluators/rules/](./harness/evaluators/rules/)에, 사람이 읽는 전체 체크리스트는 [docs/checklist.md](./docs/checklist.md)에 있다.

## 피드백 루프 (self-correction)

하네스의 agent runner는 `--rounds N`으로 최대 N라운드 반복을 지원한다.

1. 라운드 1: 에이전트가 초기 구현을 제출.
2. 하네스가 평가하여 `RESULT-round1.json` 생성. totalScore ≥ 90이면 수렴으로 판단하고 종료.
3. 점수가 부족하면 해당 JSON을 **라운드 2 프롬프트에 첨부**하여 에이전트가 실패 항목을 수정하도록 한다.

에이전트 구현 시 주의:
- 라운드 N 프롬프트의 `=== PREVIOUS ROUND FAILURES ===` 섹션을 주의 깊게 읽고 각 ruleId를 제거하는 방향으로 수정.
- 이전 라운드에서 이미 작성한 코드를 **완전히 재작성하지 말고** 실패 항목만 수정.

## 실행 명령

```bash
# Claude Code
harness/scripts/run-claude-code.sh harness/tasks/<category>/<taskId> --rounds 3

# Codex
harness/scripts/run-codex.sh harness/tasks/<category>/<taskId> --rounds 3

# 벤치마크 (N회 반복)
npx tsx harness/scripts/benchmark.ts --agent=claude-code \
  --task=new-domain/domain-module-basic --runs=5 --rounds=3
```

## 에이전트별 특이사항

### Claude Code

- `claude --print` 모드로 non-interactive 실행.
- `--permission-mode acceptEdits`로 파일 편집 자동 승인 (sandbox 격리 전제).
- `--add-dir <projectRoot>/docs`로 프로젝트 docs 읽기 권한 부여.
- `ANTHROPIC_API_KEY` 환경 변수 또는 `claude login`.

### Codex

- `codex exec` 모드로 non-interactive 실행.
- `--sandbox workspace-write`로 cwd 내 쓰기만 허용.
- `--ask-for-approval never`로 자동 승인.
- `OPENAI_API_KEY` 환경 변수.

## 참고

- 평가 규칙: [harness/evaluators/rules/](./harness/evaluators/rules/)
- Fixture 회귀: `cd harness && npm run test:evaluators`
- Harness 자체 점수 검증 (Golden): `harness/scripts/verify-golden.sh <taskId>`
