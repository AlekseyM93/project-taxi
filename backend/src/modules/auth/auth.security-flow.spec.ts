import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserMfaEntity } from './user-mfa.entity';

type MultiOperation = ['lpush' | 'ltrim' | 'expire', string, unknown, unknown?];

class MockRedis {
  private readonly kv = new Map<string, string>();
  private readonly ttl = new Map<string, number>();
  private readonly list = new Map<string, string[]>();

  on() {}

  async quit() {}

  async setex(key: string, ttlSec: number, value: string) {
    this.kv.set(key, value);
    this.ttl.set(key, ttlSec);
    return 'OK';
  }

  async get(key: string) {
    return this.kv.get(key) ?? null;
  }

  async del(key: string) {
    const existed = this.kv.delete(key) ? 1 : 0;
    this.list.delete(key);
    this.ttl.delete(key);
    return existed;
  }

  async exists(key: string) {
    return this.kv.has(key) ? 1 : 0;
  }

  async lpush(key: string, value: string) {
    const items = this.list.get(key) ?? [];
    items.unshift(value);
    this.list.set(key, items);
    return items.length;
  }

  async ltrim(key: string, start: number, end: number) {
    const items = this.list.get(key) ?? [];
    this.list.set(key, items.slice(start, end + 1));
    return 'OK';
  }

  async expire(key: string, ttlSec: number) {
    this.ttl.set(key, ttlSec);
    return 1;
  }

  async lrange(key: string, start: number, end: number) {
    const items = this.list.get(key) ?? [];
    return items.slice(start, end + 1);
  }

  multi() {
    const operations: MultiOperation[] = [];
    const chain = {
      lpush: (key: string, value: string) => {
        operations.push(['lpush', key, value]);
        return chain;
      },
      ltrim: (key: string, start: number, end: number) => {
        operations.push(['ltrim', key, start, end]);
        return chain;
      },
      expire: (key: string, ttlSec: number) => {
        operations.push(['expire', key, ttlSec]);
        return chain;
      },
      exec: async () => {
        for (const [op, key, arg1, arg2] of operations) {
          if (op === 'lpush') {
            await this.lpush(key, String(arg1));
          } else if (op === 'ltrim') {
            await this.ltrim(key, Number(arg1), Number(arg2));
          } else {
            await this.expire(key, Number(arg1));
          }
        }
      },
    };
    return chain;
  }
}

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => new MockRedis()),
  };
});

describe('AuthService security flows', () => {
  const adminUser = {
    id: 'admin-1',
    phone: '+79990000001',
    role: 'ADMIN',
    passwordHash: '',
  };

  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let userMfaRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    adminUser.passwordHash = await bcrypt.hash('pass1234', 4);

    usersService = {
      findByPhone: jest.fn(),
      createUser: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      signAsync: jest.fn(async (payload: Record<string, unknown>) =>
        JSON.stringify(payload),
      ),
      verifyAsync: jest.fn(async (token: string) => JSON.parse(token)),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string, fallback?: string) => {
        const map: Record<string, string> = {
          REDIS_URL: 'redis://localhost:6379',
          JWT_SECRET: 'super-long-test-secret',
          JWT_EXPIRES_IN: '900',
          JWT_REFRESH_EXPIRES_IN: '1800',
          AUTH_PRIVILEGED_MFA_REQUIRED: 'true',
          AUTH_PRIVILEGED_MFA_WINDOW_STEPS: '1',
          AUTH_AUDIT_RETENTION: '30d',
          AUTH_AUDIT_MAX_ITEMS: '1000',
          AUTH_MFA_ENCRYPTION_KEY: 'test-encryption-key-should-be-long-enough',
          AUTH_MFA_ISSUER: 'TaxiPlatform',
        };
        return (map[key] ?? fallback) as never;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    userMfaRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (entity: UserMfaEntity) => entity),
      create: jest.fn((entity: UserMfaEntity) => entity),
    };

    authService = new AuthService(
      userMfaRepo as never,
      usersService,
      jwtService,
      configService,
    );
  });

  it('rejects privileged login without MFA configured', async () => {
    usersService.findByPhone.mockResolvedValue(adminUser as never);
    userMfaRepo.findOne.mockResolvedValue(null);

    await expect(
      authService.login(adminUser.phone, 'pass1234'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in privileged user with a recovery code and consumes it', async () => {
    usersService.findByPhone.mockResolvedValue(adminUser as never);
    const recoveryHash = await bcrypt.hash('AAAAA-BBBBB', 4);
    // Store SHA256 hash to match production hashing behavior.
    const hashed = authService['hashRecoveryCode']('AAAAA-BBBBB');
    userMfaRepo.findOne.mockResolvedValue({
      id: 'mfa-1',
      userId: adminUser.id,
      encryptedSecret: 'enc',
      secretIv: 'iv',
      secretAuthTag: 'tag',
      recoveryCodesHash: [hashed],
      enabled: true,
      enrolledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserMfaEntity);
    userMfaRepo.save.mockImplementation(
      async (entity: UserMfaEntity) => entity,
    );

    const result = await authService.login(
      adminUser.phone,
      'pass1234',
      undefined,
      'AAAAA-BBBBB',
    );

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    const saved = userMfaRepo.save.mock.calls.at(-1)?.[0] as UserMfaEntity;
    expect(saved.recoveryCodesHash).toHaveLength(0);
    expect(recoveryHash).toBeTruthy();
  });

  it('rejects privileged login when MFA challenge is missing', async () => {
    usersService.findByPhone.mockResolvedValue(adminUser as never);
    userMfaRepo.findOne.mockResolvedValue({
      id: 'mfa-required',
      userId: adminUser.id,
      encryptedSecret: 'enc',
      secretIv: 'iv',
      secretAuthTag: 'tag',
      recoveryCodesHash: [],
      enabled: true,
      enrolledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserMfaEntity);

    await expect(authService.login(adminUser.phone, 'pass1234')).rejects.toThrow(
      'MFA code or recovery code is required for privileged role',
    );
  });

  it('rejects privileged login with invalid recovery code', async () => {
    usersService.findByPhone.mockResolvedValue(adminUser as never);
    const validHash = authService['hashRecoveryCode']('AAAAA-BBBBB');
    userMfaRepo.findOne.mockResolvedValue({
      id: 'mfa-invalid-recovery',
      userId: adminUser.id,
      encryptedSecret: 'enc',
      secretIv: 'iv',
      secretAuthTag: 'tag',
      recoveryCodesHash: [validHash],
      enabled: true,
      enrolledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserMfaEntity);

    await expect(
      authService.login(adminUser.phone, 'pass1234', undefined, 'WRONG-CODE1'),
    ).rejects.toThrow('Invalid MFA recovery code');
  });

  it('rejects reused recovery code after first successful login', async () => {
    usersService.findByPhone.mockResolvedValue(adminUser as never);
    const reusableHash = authService['hashRecoveryCode']('AAAAA-BBBBB');
    const setting: UserMfaEntity = {
      id: 'mfa-reuse',
      userId: adminUser.id,
      encryptedSecret: 'enc',
      secretIv: 'iv',
      secretAuthTag: 'tag',
      recoveryCodesHash: [reusableHash],
      enabled: true,
      enrolledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    userMfaRepo.findOne.mockImplementation(async () => setting);
    userMfaRepo.save.mockImplementation(async (entity: UserMfaEntity) => {
      setting.recoveryCodesHash = [...entity.recoveryCodesHash];
      return entity;
    });

    const firstLogin = await authService.login(
      adminUser.phone,
      'pass1234',
      undefined,
      'AAAAA-BBBBB',
    );
    expect(firstLogin.accessToken).toBeTruthy();

    await expect(
      authService.login(adminUser.phone, 'pass1234', undefined, 'AAAAA-BBBBB'),
    ).rejects.toThrow('Invalid MFA recovery code');
  });

  it('allows privileged login without MFA when policy is disabled', async () => {
    configService.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'AUTH_PRIVILEGED_MFA_REQUIRED') {
        return 'false' as never;
      }
      const map: Record<string, string> = {
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'super-long-test-secret',
        JWT_EXPIRES_IN: '900',
        JWT_REFRESH_EXPIRES_IN: '1800',
        AUTH_PRIVILEGED_MFA_WINDOW_STEPS: '1',
        AUTH_AUDIT_RETENTION: '30d',
        AUTH_AUDIT_MAX_ITEMS: '1000',
        AUTH_MFA_ENCRYPTION_KEY: 'test-encryption-key-should-be-long-enough',
        AUTH_MFA_ISSUER: 'TaxiPlatform',
      };
      return (map[key] ?? fallback) as never;
    });
    usersService.findByPhone.mockResolvedValue(adminUser as never);
    userMfaRepo.findOne.mockResolvedValue(null);

    const login = await authService.login(adminUser.phone, 'pass1234');

    expect(login.accessToken).toBeTruthy();
    expect(login.refreshToken).toBeTruthy();
  });

  it('rotates refresh token and revokes access token on logout', async () => {
    usersService.findByPhone.mockResolvedValue({
      ...adminUser,
      role: 'PASSENGER',
    } as never);

    const login = await authService.login(adminUser.phone, 'pass1234');
    const refreshed = await authService.refresh(login.refreshToken);
    expect(refreshed.refreshToken).not.toEqual(login.refreshToken);

    const accessPayload = JSON.parse(login.accessToken) as {
      jti?: string;
      exp?: number;
      sub?: string;
    };
    await authService.logout({
      userId: accessPayload.sub,
      accessTokenJti: accessPayload.jti,
      accessTokenExp: Math.floor(Date.now() / 1000) + 120,
      refreshToken: login.refreshToken,
    });

    const revoked = await authService.isAccessTokenRevoked(accessPayload.jti);
    expect(revoked).toBe(true);
  });
});
