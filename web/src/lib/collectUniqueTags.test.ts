import { describe, expect, it } from 'vitest';
import { collectUniqueTags } from './collectUniqueTags';

describe('collectUniqueTags', () => {
  it('пустой список — пустой массив', () => {
    expect(collectUniqueTags([])).toEqual([]);
  });

  it('собирает теги всех записей без повторов', () => {
    expect(
      collectUniqueTags([{ tags: ['старшая', 'база'] }, { tags: ['разминка'] }]),
    ).toEqual(['старшая', 'база', 'разминка']);
  });

  it('одинаковый тег у нескольких записей — одна пилюля', () => {
    expect(
      collectUniqueTags([{ tags: ['старшая'] }, { tags: ['старшая', 'база'] }]),
    ).toEqual(['старшая', 'база']);
  });

  it('порядок — по первому появлению, а не по алфавиту', () => {
    expect(collectUniqueTags([{ tags: ['я', 'а'] }])).toEqual(['я', 'а']);
  });

  it('запись без тегов не мешает соседям', () => {
    expect(collectUniqueTags([{ tags: [] }, { tags: ['база'] }])).toEqual(['база']);
  });
});
