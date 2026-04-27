import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { HttpLoggingInterceptor } from './common/http-logging.interceptor';
import { securityHeadersMiddleware } from './common/security-headers.middleware';
import { authRateLimitMiddleware } from './common/auth-rate-limit.middleware';

function resolveAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : ['http://localhost:5173'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    cors: {
      origin: resolveAllowedOrigins(),
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });
  const config = app.get(ConfigService);
  app.use(
    json({
      verify: (req, _res, buffer) => {
        (req as { rawBody?: string }).rawBody = buffer.toString('utf8');
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(authRateLimitMiddleware);
  app.useGlobalInterceptors(new HttpLoggingInterceptor());

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
