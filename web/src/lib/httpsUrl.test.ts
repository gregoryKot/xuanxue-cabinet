import { describe, expect, it } from 'vitest';
import { isHttpsUrl } from './httpsUrl';

describe('isHttpsUrl', () => {
  it('https:// — true', () => {
    expect(isHttpsUrl('https://youtu.be/x')).toBe(true);
  });

  it('http:// — false', () => {
    expect(isHttpsUrl('http://youtu.be/x')).toBe(false);
  });

  it('обрезает пробелы по краям перед проверкой', () => {
    expect(isHttpsUrl('  https://youtu.be/x  ')).toBe(true);
  });

  it('пустая строка — false', () => {
    expect(isHttpsUrl('')).toBe(false);
  });
});
