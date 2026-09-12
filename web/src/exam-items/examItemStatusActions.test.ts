import { describe, expect, it } from 'vitest';
import { examItemStatusActions } from './examItemStatusActions';

describe('examItemStatusActions', () => {
  it('черновик — «Опубликовать» и «В архив»', () => {
    expect(examItemStatusActions('draft')).toEqual([
      { label: 'Опубликовать', nextStatus: 'published' },
      { label: 'В архив', nextStatus: 'archived' },
    ]);
  });

  it('опубликован — «Вернуть в черновик» и «В архив»', () => {
    expect(examItemStatusActions('published')).toEqual([
      { label: 'Вернуть в черновик', nextStatus: 'draft' },
      { label: 'В архив', nextStatus: 'archived' },
    ]);
  });

  it('в архиве — только «Вернуть в черновик» (решение агента: не тупик)', () => {
    expect(examItemStatusActions('archived')).toEqual([
      { label: 'Вернуть в черновик', nextStatus: 'draft' },
    ]);
  });
});
