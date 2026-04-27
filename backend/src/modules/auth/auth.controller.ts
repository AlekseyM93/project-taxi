import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  LogoutDto,
  MfaEnrollConfirmDto,
  MfaRecoveryLoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(
      dto.phone,
      dto.password,
      dto.mfaCode,
      dto.mfaRecoveryCode,
    );
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('login/recovery')
  loginWithRecovery(@Body() dto: MfaRecoveryLoginDto) {
    return this.auth.login(
      dto.phone,
      dto.password,
      undefined,
      dto.recoveryCode,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: Request, @Body() dto: LogoutDto) {
    const user = req.user as
      | { sub?: string; role?: string; jti?: string; exp?: number }
      | undefined;
    return this.auth.logout({
      userId: user?.sub,
      accessTokenJti: user?.jti,
      accessTokenExp: user?.exp,
      refreshToken: dto.refreshToken,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Get('audit/recent')
  getRecentAudit(@Query('limit') limitRaw?: string) {
    const parsedLimit = Number.parseInt(limitRaw ?? '100', 10);
    const limit = Number.isNaN(parsedLimit) ? 100 : parsedLimit;
    return this.auth.getRecentAuthAudit(limit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('mfa/enroll/init')
  initMfaEnrollment(@Req() req: Request) {
    const user = req.user as { sub?: string; role?: string; phone?: string };
    return this.auth.initMfaEnrollment({
      userId: user?.sub ?? '',
      role: (user?.role as 'ADMIN' | 'DISPATCHER') ?? 'DISPATCHER',
      phone: user?.phone,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('mfa/enroll/confirm')
  confirmMfaEnrollment(@Req() req: Request, @Body() dto: MfaEnrollConfirmDto) {
    const user = req.user as { sub?: string; role?: string };
    return this.auth.confirmMfaEnrollment({
      userId: user?.sub ?? '',
      role: (user?.role as 'ADMIN' | 'DISPATCHER') ?? 'DISPATCHER',
      code: dto.code,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('mfa/recovery/regenerate')
  regenerateRecoveryCodes(@Req() req: Request) {
    const user = req.user as { sub?: string; role?: string };
    return this.auth.regenerateRecoveryCodes({
      userId: user?.sub ?? '',
      role: (user?.role as 'ADMIN' | 'DISPATCHER') ?? 'DISPATCHER',
    });
  }
}
