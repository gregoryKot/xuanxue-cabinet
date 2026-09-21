import { describe, expect, it } from 'vitest';
import { formatTagSummaryMeta } from './tagSummaryMeta';

describe('formatTagSummaryMeta', () => {
  it('оба числа не нули — склонение по количеству', () => {
    expect(
      formatTagSummaryMeta({ tag: 'дракон', lessonCount: 1, materialCount: 1 }),
    ).toBe('1 занятие · 1 материал');
    expect(
      formatTagSummaryMeta({ tag: 'дракон', lessonCount: 2, materialCount: 3 }),
    ).toBe('2 занятия · 3 материала');
    expect(
      formatTagSummaryMeta({ tag: 'дракон', lessonCount: 5, materialCount: 12 }),
    ).toBe('5 занятий · 12 материалов');
  });

  it('занятий нет — словами, не «0 занятий»', () => {
    expect(
      formatTagSummaryMeta({ tag: 'дракон', lessonCount: 0, materialCount: 4 }),
    ).toBe('занятий нет · 4 материала');
  });

  it('материалов нет — словами, не «0 материалов»', () => {
    expect(
      formatTagSummaryMeta({ tag: 'дракон', lessonCount: 7, materialCount: 0 }),
    ).toBe('7 занятий · материалов нет');
  });
});
