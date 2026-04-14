import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => {
          const payload = {
            level: 'info',
            event: 'http_request',
            requestId: req.requestId || req.headers['x-request-id'] || null,
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
          };
          console.log(JSON.stringify(payload));
        },
        error: () => {
          const payload = {
            level: 'error',
            event: 'http_request_error',
            requestId: req.requestId || req.headers['x-request-id'] || null,
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
          };
          console.log(JSON.stringify(payload));
        },
      }),
    );
  }
}
