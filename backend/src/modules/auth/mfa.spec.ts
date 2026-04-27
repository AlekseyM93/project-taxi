import { verifyTotpCode } from './mfa';

describe('verifyTotpCode', () => {
  it('accepts valid code from RFC6238 test vector', () => {
    const secretBase32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const timestampMs = 59_000;

    const isValid = verifyTotpCode({
      base32Secret: secretBase32,
      code: '287082',
      timestampMs,
      digits: 6,
      periodSeconds: 30,
      windowSteps: 0,
    });

    expect(isValid).toBe(true);
  });

  it('rejects invalid code', () => {
    const isValid = verifyTotpCode({
      base32Secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      code: '123456',
      timestampMs: 59_000,
      digits: 6,
      periodSeconds: 30,
      windowSteps: 0,
    });

    expect(isValid).toBe(false);
  });

  it('supports time window tolerance', () => {
    const secretBase32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const isValid = verifyTotpCode({
      base32Secret: secretBase32,
      code: '287082',
      timestampMs: 70_000,
      digits: 6,
      periodSeconds: 30,
      windowSteps: 1,
    });

    expect(isValid).toBe(true);
  });
});
