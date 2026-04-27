import { createHmac } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const normalized = input
    .toUpperCase()
    .replaceAll('=', '')
    .replaceAll(' ', '')
    .replaceAll('-', '');

  let bits = '';
  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) {
      throw new Error('Invalid base32 secret');
    }
    bits += idx.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const codeInt =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (codeInt % 10 ** digits).toString().padStart(digits, '0');
}

export function verifyTotpCode(params: {
  base32Secret: string;
  code: string;
  timestampMs?: number;
  periodSeconds?: number;
  digits?: number;
  windowSteps?: number;
}): boolean {
  const periodSeconds = params.periodSeconds ?? 30;
  const digits = params.digits ?? 6;
  const windowSteps = params.windowSteps ?? 1;
  const nowMs = params.timestampMs ?? Date.now();
  const normalizedCode = params.code.trim();
  if (!/^\d{6,8}$/.test(normalizedCode)) {
    return false;
  }

  const secret = base32Decode(params.base32Secret);
  const counterNow = Math.floor(nowMs / 1000 / periodSeconds);

  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const counter = counterNow + delta;
    if (counter < 0) {
      continue;
    }
    if (hotp(secret, counter, digits) === normalizedCode) {
      return true;
    }
  }

  return false;
}
