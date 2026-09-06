import { CSRF_HEADER } from '@xuanxue/shared';
import { hasCsrfHeader } from './csrf';

describe('hasCsrfHeader', () => {
  it('непустая строка — true', () => {
    expect(hasCsrfHeader({ [CSRF_HEADER]: 'fetch' })).toBe(true);
  });

  it('заголовка нет — false', () => {
    expect(hasCsrfHeader({})).toBe(false);
  });

  it('пустая строка — false', () => {
    expect(hasCsrfHeader({ [CSRF_HEADER]: '' })).toBe(false);
  });
});
