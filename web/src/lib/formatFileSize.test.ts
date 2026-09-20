import { describe, expect, it } from 'vitest';
import { formatFileSize } from './formatFileSize';

describe('formatFileSize', () => {
  it('меньше мегабайта — килобайты целым числом', () => {
    expect(formatFileSize(500 * 1024)).toBe('500 КБ');
  });

  it('округляет килобайты', () => {
    expect(formatFileSize(1500)).toBe('1 КБ');
  });

  it('мегабайт и больше — с одним знаком после запятой', () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 МБ');
  });

  it('ровно мегабайт — «1,0 МБ», не «1 МБ»', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1,0 МБ');
  });

  it('ноль байт — «0 КБ»', () => {
    expect(formatFileSize(0)).toBe('0 КБ');
  });
});
