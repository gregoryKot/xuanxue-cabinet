import { describe, expect, it } from 'vitest';
import { isBoardNoticeActive, type BoardNotice } from './board';

const NOTICE: BoardNotice = {
  text: 'Ретрит в ноябре — оплата до 20 октября Маше',
  until: '2026-10-20',
};

describe('isBoardNoticeActive', () => {
  it('объявления нет — не активно', () => {
    expect(isBoardNoticeActive(undefined, '2026-10-06')).toBe(false);
  });

  it('до срока — активно', () => {
    expect(isBoardNoticeActive(NOTICE, '2026-10-06')).toBe(true);
  });

  it('в последний день срока — ещё активно (включительно)', () => {
    expect(isBoardNoticeActive(NOTICE, '2026-10-20')).toBe(true);
  });

  it('на следующий день после срока — уже нет', () => {
    expect(isBoardNoticeActive(NOTICE, '2026-10-21')).toBe(false);
  });

  it('срок в другом месяце и годе сравнивается по календарю, не по длине строки', () => {
    expect(isBoardNoticeActive({ ...NOTICE, until: '2027-01-05' }, '2026-12-31')).toBe(
      true,
    );
    expect(isBoardNoticeActive({ ...NOTICE, until: '2026-09-30' }, '2026-10-01')).toBe(
      false,
    );
  });

  it('пустой или из одних пробелов текст — не активно', () => {
    expect(isBoardNoticeActive({ ...NOTICE, text: '' }, '2026-10-06')).toBe(false);
    expect(isBoardNoticeActive({ ...NOTICE, text: '  \n ' }, '2026-10-06')).toBe(false);
  });
});
