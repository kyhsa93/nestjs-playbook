# 앱 부트스트랩

```typescript
// src/main.ts
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { HttpExceptionFilter } from '@/common/http-exception.filter'
import { AppModule } from '@/app-module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Graceful Shutdown — SIGTERM/SIGINT 수신 시 NestJS 라이프사이클 훅 활성화
  app.enableShutdownHooks()

  // 전역 ValidationPipe — class-validator 자동 적용
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // DTO에 정의되지 않은 필드 제거
    forbidNonWhitelisted: true, // 정의되지 않은 필드가 있으면 400 에러
    transform: true             // 요청 데이터를 DTO 클래스 인스턴스로 자동 변환
  }))

  // 전역 예외 필터
  app.useGlobalFilters(new HttpExceptionFilter())

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true
  })

  // Swagger
  const document = SwaggerModule.createDocument(app,
    new DocumentBuilder()
      .setTitle(process.env.APP_NAME ?? 'API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
      .build()
  )
  SwaggerModule.setup('api', app, document)

  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
```

### 설정 요약

| 설정 | 역할 |
|------|------|
| `enableShutdownHooks()` | SIGTERM/SIGINT 수신 시 NestJS 종료 라이프사이클 훅 활성화 ([상세](graceful-shutdown.md)) |
| `ValidationPipe` | class-validator 데코레이터 자동 적용, 미정의 필드 차단 |
| `HttpExceptionFilter` | 에러 응답 형식 표준화 |
| `enableCors` | CORS 허용 origin 설정 (환경 변수) |
| `SwaggerModule` | API 문서 자동 생성, `/api` 경로에서 접근 |
| `addBearerAuth` | Swagger UI에서 JWT 토큰 입력 지원 |
