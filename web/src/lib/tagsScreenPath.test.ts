import { describe, expect, it } from 'vitest';
import { tagsScreenPath } from './tagsScreenPath';

describe('tagsScreenPath', () => {
  it('без тега — сам экран, без query', () => {
    expect(tagsScreenPath()).toBe('/materials/tags');
    expect(tagsScreenPath('')).toBe('/materials/tags');
  });

  it('с тегом — query-параметр tag, не сегмент пути', () => {
    expect(tagsScreenPath('дракон')).toBe(
      `/materials/tags?tag=${encodeURIComponent('дракон')}`,
    );
  });

  it('тег со слэшем — кодируется и переживает разбор через URLSearchParams', () => {
    const tag = 'ушу/тайцзи';
    const path = tagsScreenPath(tag);

    expect(path).not.toBe(`/materials/tags?tag=${tag}`);
    const [pathname, search] = path.split('?');
    expect(pathname).toBe('/materials/tags');
    expect(new URLSearchParams(search).get('tag')).toBe(tag);
  });
});
