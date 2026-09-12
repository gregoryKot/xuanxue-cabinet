import { describe, expect, it } from 'vitest';
import { draftPublishedArchivedTransitions } from './statusTransitions';

describe('draftPublishedArchivedTransitions', () => {
  it('черновик — «Опубликовать» и «В архив»', () => {
    expect(draftPublishedArchivedTransitions('draft')).toEqual([
      { label: 'Опубликовать', nextStatus: 'published' },
      { label: 'В архив', nextStatus: 'archived' },
    ]);
  });

  it('опубликован — «Вернуть в черновик» и «В архив»', () => {
    expect(draftPublishedArchivedTransitions('published')).toEqual([
      { label: 'Вернуть в черновик', nextStatus: 'draft' },
      { label: 'В архив', nextStatus: 'archived' },
    ]);
  });

  it('в архиве — только «Вернуть в черновик» (не тупик)', () => {
    expect(draftPublishedArchivedTransitions('archived')).toEqual([
      { label: 'Вернуть в черновик', nextStatus: 'draft' },
    ]);
  });
});
