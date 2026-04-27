import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../../modules/auth/auth.service';

export type JwtPayload = {
  sub: string;
  role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
  driverId?: string;
  jti?: string;
  tokenType?: 'access' | 'refresh';
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const revoked = await this.authService.isAccessTokenRevoked(payload.jti);
    if (revoked) {
      throw new UnauthorizedException('Access token is revoked');
    }

    return payload;
  }
}
