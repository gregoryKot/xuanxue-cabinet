import { describe, expect, it } from 'vitest';
import { boardNoticeState } from './boardNoticeState';

const NOTICE = { text: 'Ретрит в ноябре', until: '2026-10-20' };
const JERUSALEM = { tz: 'Asia/Jerusalem' };

describe('boardNoticeState', () => {
  it('объявления нет — none', () => {
    expect(boardNoticeState(JERUSALEM, new Date('2026-10-10T12:00:00Z'))).toEqual({
      kind: 'none',
    });
  });

  it('пустой текст — тоже none, пустую плашку не рисуем', () => {
    expect(
      boardNoticeState(
        { ...JERUSALEM, boardNotice: { text: '   ', until: '2026-10-20' } },
        new Date('2026-10-10T12:00:00Z'),
      ),
    ).toEqual({ kind: 'none' });
  });

  it('последний день включительно — active', () => {
    expect(
      boardNoticeState(
        { ...JERUSALEM, boardNotice: NOTICE },
        new Date('2026-10-20T12:00:00Z'),
      ),
    ).toEqual({ kind: 'active', notice: NOTICE });
  });

  it('следующий день — expired', () => {
    expect(
      boardNoticeState(
        { ...JERUSALEM, boardNotice: NOTICE },
        new Date('2026-10-21T12:00:00Z'),
      ),
    ).toEqual({ kind: 'expired', notice: NOTICE });
  });

  // Граница дня — по поясу школы, не по UTC (CLAUDE.md «Время»): 20 октября
  // 21:30 UTC — это уже 00:30 21 октября по Иерусалиму (летнее время, UTC+3).
  it('00:30 по Иерусалиму 21-го — expired, хотя в UTC ещё 20-е', () => {
    expect(
      boardNoticeState(
        { ...JERUSALEM, boardNotice: NOTICE },
        new Date('2026-10-20T21:30:00Z'),
      ),
    ).toEqual({ kind: 'expired', notice: NOTICE });
  });

  // После перехода на зимнее время (25 октября 2026, UTC+2) граница сдвигается на час.
  it('переход на зимнее время: 31 октября 22:30 UTC — уже 1 ноября по Иерусалиму', () => {
    const notice = { text: 'Сбор до конца октября', until: '2026-10-31' };
    expect(
      boardNoticeState(
        { ...JERUSALEM, boardNotice: notice },
        new Date('2026-10-31T21:30:00Z'),
      ),
    ).toEqual({ kind: 'active', notice });
    expect(
      boardNoticeState(
        { ...JERUSALEM, boardNotice: notice },
        new Date('2026-10-31T22:30:00Z'),
      ),
    ).toEqual({ kind: 'expired', notice });
  });
});
