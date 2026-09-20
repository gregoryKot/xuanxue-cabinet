// Тест только на функцию с логикой (CLAUDE.md «Чистая логика») —
// TAGS_LIST_PATH строковый литерал, его использование проверяет
// routePrefetch.test.ts.
import { describe, expect, it } from 'vitest';
import { lessonsByTagPath } from './tagsApiPaths';

describe('lessonsByTagPath', () => {
  it('без окна: только tag и путь /lessons — ADR-0078', () => {
    expect(lessonsByTagPath('дракон')).toBe(
      `/lessons?tag=${encodeURIComponent('дракон')}`,
    );
  });

  it('тег со слэшем — кодируется, не режет путь на сегменты (ADR-0078 «Контекст»)', () => {
    const tag = 'ушу/тайцзи';
    const path = lessonsByTagPath(tag);

    expect(path).toBe(`/lessons?tag=${encodeURIComponent(tag)}`);
    expect(path).not.toContain('ушу/тайцзи');
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('tag')).toBe(tag);
  });
});
