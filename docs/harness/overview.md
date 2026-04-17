# Harness 개요

이 디렉토리는 `nestjs-playbook`을 AI Agent용 가이드 + 평가 하네스로 함께 사용하기 위한 문서를 담는다.

## 목적

1. Guide: NestJS DDD 설계/구현 규칙
2. Harness: 과제 기반 평가 시스템

## 핵심 원칙

- 비즈니스 도메인에 종속되지 않는다
- 구조/아키텍처 규칙을 평가한다
- assertion + evaluator 기반 채점

## 평가 대상

- 4레이어 구조
- repository pattern
- DI 구성
- REST 규칙

## 비평가 대상

특정 비즈니스 로직 (order, payment 등)은 평가하지 않는다
