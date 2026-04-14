import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const client: any = ctx.switchToWs().getClient();
    const token =
      client?.handshake?.auth?.token ||
      client?.handshake?.headers?.authorization?.replace('Bearer ', '');

    if (!token) return false;

    try {
      const payload = this.jwt.verify(token);
      client.user = payload;
      return true;
    } catch {
      return false;
    }
  }
}
