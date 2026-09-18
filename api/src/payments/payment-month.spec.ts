// Юнит без Mongo и без DI (CLAUDE.md «Тесты») — перевод момента в месяц
// школы (ADR-0049). Конструируем DateTime сразу в поясе Asia/Jerusalem
// (`fromObject(..., { zone })`), а не считаем смещение UTC руками: Luxon сам
// разрешает переход летнего времени по базе IANA.
import { DateTime } from 'luxon';
import { monthKeyOf } from './payment-month';

describe('monthKeyOf', () => {
  it('00:30 по Asia/Jerusalem 1 сентября — уже сентябрь, хотя в UTC ещё август', () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 9, day: 1, hour: 0, minute: 30 },
      { zone: 'Asia/Jerusalem' },
    );
    // Само условие теста: в UTC этот момент ещё в августе.
    expect(now.toUTC().month).toBe(8);
    expect(monthKeyOf(now, 'Asia/Jerusalem')).toBe('2026-09');
  });

  it('переход летнего времени в конце октября не сдвигает месяц', () => {
    const beforeTransition = DateTime.fromObject(
      { year: 2026, month: 10, day: 31, hour: 23, minute: 30 },
      { zone: 'Asia/Jerusalem' },
    );
    const afterTransition = DateTime.fromObject(
      { year: 2026, month: 11, day: 1, hour: 0, minute: 30 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(monthKeyOf(beforeTransition, 'Asia/Jerusalem')).toBe('2026-10');
    expect(monthKeyOf(afterTransition, 'Asia/Jerusalem')).toBe('2026-11');
  });

  it('результат не зависит от TZ процесса — CI гоняет jest в UTC и под Australia/Sydney', () => {
    const now = DateTime.fromObject(
      { year: 2026, month: 1, day: 1, hour: 12 },
      { zone: 'utc' },
    );
    expect(monthKeyOf(now, 'Asia/Jerusalem')).toBe('2026-01');
  });

  it('первое число месяца в самом начале суток по школьному поясу', () => {
    const now = DateTime.fromObject(
      { year: 2027, month: 1, day: 1, hour: 0, minute: 1 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(monthKeyOf(now, 'Asia/Jerusalem')).toBe('2027-01');
  });
});
