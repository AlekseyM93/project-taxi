import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private normalizeReason(value: unknown): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().toUpperCase().replace(/\s+/g, '_');
    }
    return 'INTERNAL_ERROR';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId =
      String(request.headers['x-request-id'] || '').trim() || randomUUID();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let reason = 'INTERNAL_ERROR';
    let details: unknown;

    if (isHttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        reason = this.normalizeReason(payload);
      } else if (payload && typeof payload === 'object') {
        const message = (payload as { message?: unknown }).message;
        if (Array.isArray(message)) {
          reason = 'VALIDATION_ERROR';
          details = message;
        } else if (typeof message === 'string') {
          reason = this.normalizeReason(message);
        } else {
          reason = this.normalizeReason((payload as { error?: unknown }).error);
        }
      }
    }

    response.setHeader('x-trace-id', traceId);
    response.status(statusCode).json({
      ok: false,
      error: {
        code: reason,
        reason,
        statusCode,
        traceId,
        path: request.url,
        details: details ?? null,
      },
    });
  }
}
