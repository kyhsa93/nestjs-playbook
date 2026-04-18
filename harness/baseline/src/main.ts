import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'

import { AppModule } from './app-module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.enableShutdownHooks()
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  const swaggerConfig = new DocumentBuilder()
    .setTitle(process.env.APP_NAME ?? 'API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'token')
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig))

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
}

void bootstrap()
