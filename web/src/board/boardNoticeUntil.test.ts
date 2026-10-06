// «До 20 октября»: число берётся из строки даты как есть, пояс машины его не
// сдвигает (CI гоняет vitest ещё и под TZ=Australia/Sydney).
import { describe, expect, it } from 'vitest';
import { boardNoticeUntilText } from './boardNoticeUntil';

describe('boardNoticeUntilText', () => {
  it('день и месяц в родительном падеже', () => {
    expect(boardNoticeUntilText('2026-10-20')).toBe('До 20 октября');
  });

  it('первое число и конец года — без сдвига на соседний день', () => {
    expect(boardNoticeUntilText('2026-11-01')).toBe('До 1 ноября');
    expect(boardNoticeUntilText('2026-12-31')).toBe('До 31 декабря');
  });
});
