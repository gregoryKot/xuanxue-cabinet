import { describe, expect, it } from 'vitest';
import { INVITE_CODE_RE } from './invite-link';

describe('INVITE_CODE_RE', () => {
  it("принимает 32 hex-символа (randomBytes(16).toString('hex'))", () => {
    expect(INVITE_CODE_RE.test('0123456789abcdef0123456789abcdef')).toBe(true);
  });

  it.each([
    '',
    'a'.repeat(31),
    'a'.repeat(33),
    'A'.repeat(32),
    'g'.repeat(32),
    '../etc/passwd',
  ])('отклоняет %s', (value) => {
    expect(INVITE_CODE_RE.test(value)).toBe(false);
  });
});
