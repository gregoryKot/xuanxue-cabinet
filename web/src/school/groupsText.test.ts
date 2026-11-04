import { describe, expect, it } from 'vitest';
import { groupClassCountText, groupsSummaryText } from './groupsText';

describe('groupClassCountText', () => {
  it('склоняет число занятий по-русски, включая 11–14 и 21', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25].map(groupClassCountText)).toEqual([
      '1 занятие',
      '2 занятия',
      '5 занятий',
      '11 занятий',
      '12 занятий',
      '21 занятие',
      '22 занятия',
      '25 занятий',
    ]);
  });

  it('у группы без занятий — «Занятий нет», а не «0 занятий»', () => {
    expect(groupClassCountText(0)).toBe('Занятий нет');
  });
});

describe('groupsSummaryText', () => {
  it('число групп выделено акцентом', () => {
    expect(groupsSummaryText(3)).toBe('Групп: **3**');
  });

  it('пустая школа — честное «Групп пока нет», не «0» и не NaN', () => {
    expect(groupsSummaryText(0)).toBe('Групп пока нет');
  });
});
