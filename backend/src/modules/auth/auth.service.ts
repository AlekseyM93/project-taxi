import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto';
import { UserRole } from '../users/user.entity';
import { verifyTotpCode } from './mfa';
import { UserMfaEntity } from './user-mfa.entity';

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly jwtSecret: string;
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;
  private readonly authAuditRetentionSec: number;
  private readonly authAuditMaxItems: number;

  constructor(
    @InjectRepository(UserMfaEntity)
    private readonly userMfaRepo: Repository<UserMfaEntity>,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.redis = new Redis(redisUrl);
    this.redis.on('error', (err) => {
      console.log('[AUTH] redis error:', err?.message ?? err);
    });

    this.jwtSecret = this.configService.get<string>('JWT_SECRET', '');
    this.accessTtlSec = this.parseTtlToSeconds(
      this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
      60 * 60 * 24 * 7,
    );
    this.refreshTtlSec = this.parseTtlToSeconds(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
      60 * 60 * 24 * 30,
    );
    this.authAuditRetentionSec = this.parseTtlToSeconds(
      this.configService.get<string>('AUTH_AUDIT_RETENTION', '30d'),
      60 * 60 * 24 * 30,
    );
    const maxItems = Number.parseInt(
      this.configService.get<string>('AUTH_AUDIT_MAX_ITEMS', '2000'),
      10,
    );
    this.authAuditMaxItems = Number.isNaN(maxItems)
      ? 2000
      : Math.min(Math.max(maxItems, 100), 20000);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async register(dto: RegisterDto) {
    const user = await this.users.createUser(dto.phone, dto.password, dto.role);
    await this.trackAuthEvent('REGISTER_SUCCESS', {
      userId: user.id,
      role: user.role,
      phoneMasked: this.maskPhone(user.phone),
    });
    return { id: user.id };
  }

  async login(
    phone: string,
    password: string,
    mfaCode?: string,
    mfaRecoveryCode?: string,
  ) {
    const user = await this.users.findByPhone(phone);
    if (!user) {
      await this.trackAuthEvent('LOGIN_FAILED_BAD_CREDENTIALS', {
        phoneMasked: this.maskPhone(phone),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.trackAuthEvent('LOGIN_FAILED_BAD_CREDENTIALS', {
        userId: user.id,
        role: user.role,
        phoneMasked: this.maskPhone(user.phone),
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      await this.verifyPrivilegedMfa({
        userId: user.id,
        role: user.role,
        phone: user.phone,
        mfaCode,
        mfaRecoveryCode,
      });
    } catch (error) {
      await this.trackAuthEvent('LOGIN_FAILED_MFA', {
        userId: user.id,
        role: user.role,
        phoneMasked: this.maskPhone(user.phone),
        reason:
          error instanceof Error
            ? error.message
            : 'MFA validation failed for privileged user',
      });
      throw error;
    }

    const tokens = await this.issueTokenPair({
      sub: user.id,
      role: user.role,
      driverId: user.role === 'DRIVER' ? user.id : undefined,
    });
    await this.trackAuthEvent('LOGIN_SUCCESS', {
      userId: user.id,
      role: user.role,
      phoneMasked: this.maskPhone(user.phone),
      mfaUsed: user.role === 'ADMIN' || user.role === 'DISPATCHER',
    });
    return tokens;
  }

  async refresh(refreshToken: string) {
    if (!this.jwtSecret) {
      await this.trackAuthEvent('REFRESH_FAILED_CONFIG');
      throw new UnauthorizedException('JWT secret is not configured');
    }

    let payload: {
      sub: string;
      role: UserRole;
      jti?: string;
      tokenType?: 'access' | 'refresh';
      driverId?: string;
    };

    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.jwtSecret,
      });
    } catch {
      await this.trackAuthEvent('REFRESH_FAILED_INVALID_TOKEN');
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.tokenType !== 'refresh' || !payload.jti) {
      await this.trackAuthEvent('REFRESH_FAILED_INVALID_TOKEN_TYPE', {
        userId: payload.sub,
        role: payload.role,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshSessionKey = this.refreshSessionKey(payload.jti);
    const activeSessionUserId = await this.redis.get(refreshSessionKey);
    if (!activeSessionUserId || activeSessionUserId !== payload.sub) {
      await this.trackAuthEvent('REFRESH_FAILED_REVOKED', {
        userId: payload.sub,
        role: payload.role,
      });
      throw new UnauthorizedException('Refresh token is revoked');
    }

    await this.redis.del(refreshSessionKey);

    const tokens = await this.issueTokenPair({
      sub: payload.sub,
      role: payload.role,
      driverId: payload.driverId,
    });
    await this.trackAuthEvent('REFRESH_SUCCESS', {
      userId: payload.sub,
      role: payload.role,
    });
    return tokens;
  }

  async logout(params: {
    userId?: string;
    accessTokenJti?: string;
    accessTokenExp?: number;
    refreshToken?: string;
  }) {
    let accessTokenRevoked = false;
    if (params.accessTokenJti && params.accessTokenExp) {
      const nowSec = Math.floor(Date.now() / 1000);
      const ttlSec = Math.max(1, params.accessTokenExp - nowSec);
      await this.redis.setex(
        this.revokedAccessTokenKey(params.accessTokenJti),
        ttlSec,
        params.userId ?? 'unknown',
      );
      accessTokenRevoked = true;
    }

    let refreshTokenRevoked = false;
    if (params.refreshToken && this.jwtSecret) {
      try {
        const payload = await this.jwt.verifyAsync<{
          sub: string;
          jti?: string;
          tokenType?: 'access' | 'refresh';
        }>(params.refreshToken, {
          secret: this.jwtSecret,
        });
        if (payload.tokenType === 'refresh' && payload.jti) {
          await this.redis.del(this.refreshSessionKey(payload.jti));
          refreshTokenRevoked = true;
        }
      } catch {
        // Ignore invalid refresh tokens on logout to keep endpoint idempotent.
      }
    }

    await this.trackAuthEvent('LOGOUT', {
      userId: params.userId,
      accessTokenRevoked,
      refreshTokenRevoked,
    });

    return { ok: true };
  }

  async getRecentAuthAudit(limit = 100) {
    const boundedLimit = Math.min(Math.max(limit, 1), 500);
    const rawItems = await this.redis.lrange(
      this.authAuditListKey(),
      0,
      boundedLimit - 1,
    );
    const items = rawItems
      .map((item) => {
        try {
          return JSON.parse(item) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((item): item is Record<string, unknown> => item !== null);

    return {
      items,
      limit: boundedLimit,
    };
  }

  async isAccessTokenRevoked(jti?: string): Promise<boolean> {
    if (!jti) {
      return true;
    }
    const exists = await this.redis.exists(this.revokedAccessTokenKey(jti));
    return exists === 1;
  }

  async validateAccessToken(token: string): Promise<{
    sub: string;
    role: UserRole;
    driverId?: string;
    jti: string;
    tokenType: 'access';
    exp?: number;
  }> {
    if (!this.jwtSecret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }

    let payload: {
      sub?: string;
      role?: UserRole;
      driverId?: string;
      jti?: string;
      tokenType?: 'access' | 'refresh';
      exp?: number;
    };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (
      !payload.sub ||
      !payload.role ||
      payload.tokenType !== 'access' ||
      !payload.jti
    ) {
      throw new UnauthorizedException('Invalid access token payload');
    }

    const revoked = await this.isAccessTokenRevoked(payload.jti);
    if (revoked) {
      throw new UnauthorizedException('Access token is revoked');
    }

    return {
      sub: payload.sub,
      role: payload.role,
      driverId: payload.driverId,
      jti: payload.jti,
      tokenType: 'access',
      exp: payload.exp,
    };
  }

  async initMfaEnrollment(params: {
    userId: string;
    role: UserRole;
    phone?: string;
  }) {
    this.ensurePrivilegedRole(params.role);
    const secret = this.generateBase32Secret();
    const pending = {
      secret,
      createdAt: new Date().toISOString(),
      phone: params.phone ?? '',
    };
    await this.redis.setex(
      this.pendingMfaEnrollmentKey(params.userId),
      60 * 10,
      JSON.stringify(pending),
    );

    const otpAuthUri = this.buildOtpAuthUri({
      accountName: params.phone ?? params.userId,
      secret,
    });
    return {
      secret,
      otpAuthUri,
      expiresInSec: 60 * 10,
    };
  }

  async confirmMfaEnrollment(params: {
    userId: string;
    role: UserRole;
    code: string;
  }) {
    this.ensurePrivilegedRole(params.role);
    const pendingRaw = await this.redis.get(
      this.pendingMfaEnrollmentKey(params.userId),
    );
    if (!pendingRaw) {
      throw new BadRequestException('MFA_ENROLLMENT_NOT_INITIALIZED');
    }

    const pending = this.parseMfaEnrollmentPayload(pendingRaw);
    const isValid = verifyTotpCode({
      base32Secret: pending.secret,
      code: params.code.trim(),
      windowSteps: this.getMfaWindowSteps(),
    });
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    const encrypted = this.encryptMfaSecret(pending.secret);
    const recoveryCodes = this.generateRecoveryCodes();
    const recoveryCodesHash = recoveryCodes.map((item) =>
      this.hashRecoveryCode(item),
    );

    const existing = await this.userMfaRepo.findOne({
      where: { userId: params.userId },
    });
    const entity = this.userMfaRepo.create({
      id: existing?.id,
      userId: params.userId,
      encryptedSecret: encrypted.encryptedSecret,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      enabled: true,
      enrolledAt: new Date(),
      recoveryCodesHash,
    });
    await this.userMfaRepo.save(entity);
    await this.redis.del(this.pendingMfaEnrollmentKey(params.userId));
    await this.trackAuthEvent('MFA_ENROLLMENT_CONFIRMED', {
      userId: params.userId,
    });

    return {
      ok: true,
      recoveryCodes,
    };
  }

  async regenerateRecoveryCodes(params: { userId: string; role: UserRole }) {
    this.ensurePrivilegedRole(params.role);
    const setting = await this.userMfaRepo.findOne({
      where: { userId: params.userId, enabled: true },
    });
    if (!setting) {
      throw new BadRequestException('MFA_NOT_CONFIGURED');
    }

    const recoveryCodes = this.generateRecoveryCodes();
    setting.recoveryCodesHash = recoveryCodes.map((item) =>
      this.hashRecoveryCode(item),
    );
    await this.userMfaRepo.save(setting);
    await this.trackAuthEvent('MFA_RECOVERY_CODES_REGENERATED', {
      userId: params.userId,
    });
    return {
      ok: true,
      recoveryCodes,
    };
  }

  private async verifyPrivilegedMfa(params: {
    userId: string;
    role: UserRole;
    phone: string;
    mfaCode?: string;
    mfaRecoveryCode?: string;
  }) {
    const requiresPrivilegedMfa =
      this.configService.get<string>('AUTH_PRIVILEGED_MFA_REQUIRED', 'true') ===
      'true';
    const isPrivilegedRole = this.isPrivilegedRole(params.role);
    if (!requiresPrivilegedMfa || !isPrivilegedRole) {
      return;
    }

    const setting = await this.userMfaRepo.findOne({
      where: { userId: params.userId, enabled: true },
    });
    if (!setting) {
      throw new UnauthorizedException('MFA is not configured for this account');
    }

    const mfaCode = params.mfaCode?.trim();
    if (mfaCode) {
      const secret = this.decryptMfaSecret({
        encryptedSecret: setting.encryptedSecret,
        iv: setting.secretIv,
        authTag: setting.secretAuthTag,
      });
      const isValid = verifyTotpCode({
        base32Secret: secret,
        code: mfaCode,
        windowSteps: this.getMfaWindowSteps(),
      });
      if (!isValid) {
        throw new UnauthorizedException('Invalid MFA code');
      }
      return;
    }

    const recoveryCode = params.mfaRecoveryCode?.trim();
    if (recoveryCode) {
      const consumed = await this.consumeRecoveryCode(setting, recoveryCode);
      if (!consumed) {
        throw new UnauthorizedException('Invalid MFA recovery code');
      }
      await this.trackAuthEvent('MFA_RECOVERY_CODE_USED', {
        userId: params.userId,
        phoneMasked: this.maskPhone(params.phone),
      });
      return;
    }

    throw new UnauthorizedException(
      'MFA code or recovery code is required for privileged role',
    );
  }

  private parseMfaEnrollmentPayload(raw: string): {
    secret: string;
    createdAt: string;
    phone: string;
  } {
    try {
      const parsed = JSON.parse(raw) as {
        secret?: unknown;
        createdAt?: unknown;
        phone?: unknown;
      };
      if (typeof parsed?.secret !== 'string' || parsed.secret.length < 16) {
        throw new BadRequestException('MFA_ENROLLMENT_INVALID');
      }
      return {
        secret: parsed.secret,
        createdAt:
          typeof parsed.createdAt === 'string'
            ? parsed.createdAt
            : new Date().toISOString(),
        phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      };
    } catch {
      throw new BadRequestException('MFA_ENROLLMENT_INVALID');
    }
  }

  private async trackAuthEvent(
    eventType: string,
    data?: Record<string, unknown>,
  ) {
    try {
      const payload = JSON.stringify({
        id: randomUUID(),
        eventType,
        createdAt: new Date().toISOString(),
        ...data,
      });
      await this.redis
        .multi()
        .lpush(this.authAuditListKey(), payload)
        .ltrim(this.authAuditListKey(), 0, this.authAuditMaxItems - 1)
        .expire(this.authAuditListKey(), this.authAuditRetentionSec)
        .exec();
    } catch {
      // Auth audit must never break the login/session flow.
    }
  }

  private async issueTokenPair(payload: {
    sub: string;
    role: UserRole;
    driverId?: string;
  }) {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessToken = await this.jwt.signAsync({
      sub: payload.sub,
      role: payload.role,
      driverId: payload.driverId,
      tokenType: 'access',
      jti: accessJti,
    });
    const refreshToken = await this.jwt.signAsync(
      {
        sub: payload.sub,
        role: payload.role,
        tokenType: 'refresh',
        jti: refreshJti,
      },
      {
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '30d',
        ),
      },
    );

    await this.redis.setex(
      this.refreshSessionKey(refreshJti),
      this.refreshTtlSec,
      payload.sub,
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresInSec: this.accessTtlSec,
      refreshTokenExpiresInSec: this.refreshTtlSec,
    };
  }

  private refreshSessionKey(jti: string) {
    return `auth:refresh-session:${jti}`;
  }

  private revokedAccessTokenKey(jti: string) {
    return `auth:revoked-access:${jti}`;
  }

  private authAuditListKey() {
    return 'auth:audit:events';
  }

  private pendingMfaEnrollmentKey(userId: string) {
    return `auth:mfa:pending:${userId}`;
  }

  private isPrivilegedRole(role: UserRole) {
    return role === 'ADMIN' || role === 'DISPATCHER';
  }

  private ensurePrivilegedRole(role: UserRole) {
    if (!this.isPrivilegedRole(role)) {
      throw new UnauthorizedException(
        'Operation is allowed only for privileged roles',
      );
    }
  }

  private getMfaWindowSteps() {
    const parsed = Number.parseInt(
      this.configService.get<string>('AUTH_PRIVILEGED_MFA_WINDOW_STEPS', '1'),
      10,
    );
    return Number.isNaN(parsed) ? 1 : Math.max(0, parsed);
  }

  private getMfaEncryptionKey(): Buffer {
    const raw = this.configService.get<string>('AUTH_MFA_ENCRYPTION_KEY', '');
    if (!raw || raw.trim().length < 32) {
      throw new UnauthorizedException(
        'AUTH_MFA_ENCRYPTION_KEY is not configured',
      );
    }
    return createHash('sha256').update(raw.trim(), 'utf8').digest();
  }

  private encryptMfaSecret(secret: string) {
    const key = this.getMfaEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedSecret: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private decryptMfaSecret(params: {
    encryptedSecret: string;
    iv: string;
    authTag: string;
  }) {
    const key = this.getMfaEncryptionKey();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(params.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(params.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(params.encryptedSecret, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private generateBase32Secret(length = 32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = randomBytes(length);
    let secret = '';
    for (let i = 0; i < length; i += 1) {
      secret += alphabet[bytes[i] % alphabet.length];
    }
    return secret;
  }

  private buildOtpAuthUri(params: { accountName: string; secret: string }) {
    const issuer = this.configService.get<string>(
      'AUTH_MFA_ISSUER',
      'TaxiPlatform',
    );
    const account = encodeURIComponent(params.accountName);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encodedIssuer}:${account}?secret=${params.secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  private generateRecoveryCodes(count = 8) {
    const codes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const code = randomBytes(5).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 5)}-${code.slice(5, 10)}`);
    }
    return codes;
  }

  private hashRecoveryCode(code: string) {
    return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
  }

  private async consumeRecoveryCode(setting: UserMfaEntity, code: string) {
    const targetHash = this.hashRecoveryCode(code);
    const codes = Array.isArray(setting.recoveryCodesHash)
      ? setting.recoveryCodesHash
      : [];
    const index = codes.findIndex((item) => {
      const left = Buffer.from(item, 'utf8');
      const right = Buffer.from(targetHash, 'utf8');
      if (left.length !== right.length) {
        return false;
      }
      return timingSafeEqual(left, right);
    });
    if (index < 0) {
      return false;
    }
    const nextCodes = [...codes];
    nextCodes.splice(index, 1);
    setting.recoveryCodesHash = nextCodes;
    await this.userMfaRepo.save(setting);
    return true;
  }

  private maskPhone(phone?: string) {
    const source = (phone ?? '').trim();
    if (!source) {
      return null;
    }
    if (source.length <= 4) {
      return `***${source}`;
    }
    return `${source.slice(0, 2)}***${source.slice(-2)}`;
  }

  private parseTtlToSeconds(rawTtl: string, fallbackSec: number): number {
    const normalized = rawTtl.trim().toLowerCase();
    const numeric = Number.parseInt(normalized, 10);
    if (
      normalized.length > 0 &&
      Number.isFinite(numeric) &&
      /^\d+$/.test(normalized)
    ) {
      return Math.max(1, numeric);
    }

    const match = normalized.match(/^(\d+)\s*([smhd])$/);
    if (!match) {
      return fallbackSec;
    }
    const value = Number.parseInt(match[1], 10);
    const unit = match[2];
    const multiplier =
      unit === 's'
        ? 1
        : unit === 'm'
          ? 60
          : unit === 'h'
            ? 60 * 60
            : 60 * 60 * 24;
    return Math.max(1, value * multiplier);
  }
}
