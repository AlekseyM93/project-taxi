import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    if (this.shouldBypassForAdmin(context)) {
      const req = context.switchToHttp().getRequest() as {
        user?: { sub: string; role: 'ADMIN' };
      };
      req.user = {
        sub: 'dev-admin-auth-disabled',
        role: 'ADMIN',
      };
      return true;
    }
    return super.canActivate(context);
  }

  private shouldBypassForAdmin(context: ExecutionContext) {
    if (process.env.ADMIN_AUTH_DISABLED !== 'true') {
      return false;
    }
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    if (context.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return false;
    }
    const req = context.switchToHttp().getRequest() as {
      path?: string;
      originalUrl?: string;
      url?: string;
    };
    const url = String(
      req.originalUrl ?? req.url ?? req.path ?? '',
    ).toLowerCase();
    const adminPrefixes = [
      '/orders/admin',
      '/ops/',
      '/pricing/',
      '/payments/',
      '/support/',
      '/auth/audit',
    ];
    return adminPrefixes.some((prefix) => url.includes(prefix));
  }
}
