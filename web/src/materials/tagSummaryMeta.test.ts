import { describe, expect, it } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import { formatTagSummaryMeta } from './tagSummaryMeta';

// channelCount/examItemCount функции не нужны — она их не смотрит, но тип
// TagSummaryDto требует все поля (ADR-0075 не показывает эти два числа тут).
function makeSummary(lessonCount: number, materialCount: number): TagSummaryDto {
  return {
    tag: 'дракон',
    lessonCount,
    materialCount,
    channelCount: 0,
    examItemCount: 0,
  };
}

describe('formatTagSummaryMeta', () => {
  it('оба числа не нули — склонение по количеству', () => {
    expect(formatTagSummaryMeta(makeSummary(1, 1))).toBe('1 занятие · 1 материал');
    expect(formatTagSummaryMeta(makeSummary(2, 3))).toBe('2 занятия · 3 материала');
    expect(formatTagSummaryMeta(makeSummary(5, 12))).toBe('5 занятий · 12 материалов');
  });

  it('занятий нет — словами, не «0 занятий»', () => {
    expect(formatTagSummaryMeta(makeSummary(0, 4))).toBe('занятий нет · 4 материала');
  });

  it('материалов нет — словами, не «0 материалов»', () => {
    expect(formatTagSummaryMeta(makeSummary(7, 0))).toBe('7 занятий · материалов нет');
  });
});
