# Harness 개요

이 디렉토리는 `nestjs-playbook`을 AI Agent용 가이드 + 평가 하네스로 함께 사용하기 위한 문서를 담는다.

## 목적

본 레포는 두 가지 역할을 가진다.

1. **Guide**
   - AI Agent가 NestJS + TypeScript + DDD 스타일로 설계/구현할 때 따르는 규칙집
   - `README.md`, `CLAUDE.md`, `.cursor/rules/nestjs-guide.mdc`, `.github/copilot-instructions.md`가 진입점 역할을 한다.

2. **Harness**
   - AI Agent에게 과제를 부여하고
   - 산출물을 수집하고
   - 구조/규칙/실행 가능성을 평가하는 벤치마크 장치

## 핵심 원칙

- `docs/reference.md`의 비즈니스 예시는 **설명용 샘플**이다.
- `harness/tasks/`는 특정 비즈니스 도메인에 고정되지 않는다.
- 하네스는 **아키텍처 규칙 준수 능력**을 평가한다.
- 정답 코드를 하나로 고정하기보다 assertion + evaluator 기반 부분 점수 방식을 우선한다.
- 체크리스트는 사람이 읽는 문서이면서 evaluator 구현의 명세 역할도 한다.

## 평가 대상

하네스는 다음을 평가한다.

- 4레이어 구조 준수
- 레이어 의존 방향 준수
- repository pattern 준수
- command/query 분리
- module DI 연결
- REST path 규칙
- checklist 기반 일관성

## 비평가 대상

하네스는 특정 업무 도메인 지식을 평가하지 않는다.

예:
- 주문 취소
- 결제 승인
- 재고 예약
- 회원 등급 정책

이런 내용은 문서 예시나 runnable example에는 들어갈 수 있지만, 기본 하네스 과제의 필수 전제가 되어서는 안 된다.

## 핵심 디렉토리

```text
docs/harness/              하네스 운영 문서
harness/tasks/             과제 정의
harness/evaluators/        자동 평가기
harness/config/            하네스 설정
schemas/                   JSON schema
examples/                  실행 가능한 예제 기준 구현
```

## 평가 대상 작업 유형

`docs/development-process.md`의 워크플로우와 맞춰 아래 유형을 기본 task category로 사용한다.

- `new-domain`: 신규 bounded context 또는 모듈 추가
- `bugfix`: 버그 수정 / 소규모 변경
- `legacy-refactor`: 레거시 기능 수정 + vertical slice 리팩토링

## 최소 운영 흐름

1. task 선택
2. seed 코드 또는 빈 워크스페이스 준비
3. agent에게 task와 가이드를 함께 제공
4. 산출물 생성
5. evaluator 실행
6. score report 생성
