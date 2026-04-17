# Task: 도메인 모듈 기본 구현

NestJS + TypeScript 기반 서버에서 새로운 bounded context 하나를 구현하라.

## 목표

가이드의 구조와 규칙을 따르는 독립 모듈 하나를 추가한다.

## 요구사항

- 하나의 aggregate root를 가진 모듈을 구현한다.
- 생성 또는 수정용 command 흐름을 1개 이상 제공한다.
- 조회용 query 흐름을 1개 이상 제공한다.
- controller를 통해 REST API를 노출한다.
- module에서 repository / query / service DI 연결을 구성한다.

## 제약

- 4레이어 구조
- repository abstract class
- domain은 framework 의존 금지

## 평가 포인트

- 구조 준수
- repository pattern
- query/command 분리
