# Harness

이 디렉토리는 `nestjs-playbook`의 평가 하네스를 담는다.

## 목적

- AI Agent에게 NestJS DDD 과제를 부여한다.
- 산출물을 구조/규칙/실행/아키텍처 기준으로 평가한다.
- score report를 생성한다.

## 핵심 원칙

- 하네스는 특정 비즈니스 도메인을 평가하지 않는다.
- 과제는 도메인 중립적으로 설계한다.
- 문서 내 비즈니스 예시는 설명용일 뿐이다.

## 디렉토리

```text
config/        하네스 설정
tasks/         과제 정의
evaluators/    자동 평가기
reports/       평가 결과
sandbox/       제출물/워크스페이스
```
