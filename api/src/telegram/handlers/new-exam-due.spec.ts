// Пресеты срока сдачи (ADR-0125, ADR-0127) — чистая логика, без Mongo и без
// Telegram (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import { endOfDayInZoneIso, SCHOOL_TZ } from '@xuanxue/shared';
import { resolveNewExamDueAt } from './new-exam-due';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);

describe('resolveNewExamDueAt', () => {
  it('«none» — без срока', () => {
    expect(resolveNewExamDueAt('none', NOW)).toBeUndefined();
  });

  it('незнакомый id (устаревшая кнопка) — без срока, не падает', () => {
    expect(resolveNewExamDueAt('нет-такого-пресета', NOW)).toBeUndefined();
  });

  it('«1w» — конец дня через неделю по часам школы', () => {
    expect(resolveNewExamDueAt('1w', NOW)).toBe('2026-09-24T20:59:59.999Z');
  });

  it('«2w» — конец дня через две недели', () => {
    expect(resolveNewExamDueAt('2w', NOW)).toBe('2026-10-01T20:59:59.999Z');
  });

  it('«1m» — конец дня через календарный месяц', () => {
    expect(resolveNewExamDueAt('1m', NOW)).toBe('2026-10-17T20:59:59.999Z');
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // кода, который считает дату от «сейчас». `plus({ weeks: 1 })` на зоне
  // школы обязан остаться на правильном календарном дне по обе стороны
  // перехода (последнее воскресенье октября, 2026-10-25) — тест ловит
  // сдвиг на час, если бы кто-то заменил `plus` на арифметику миллисекунд.
  it('переход на зимнее время Asia/Jerusalem — «через неделю» не сдвигает календарный день', () => {
    const beforeDst = DateTime.utc(2026, 10, 20, 10, 0, 0);
    expect(resolveNewExamDueAt('1w', beforeDst)).toBe('2026-10-27T21:59:59.999Z');
  });

  it('переход на летнее время Asia/Jerusalem — «через неделю» не сдвигает календарный день', () => {
    const beforeDst = DateTime.utc(2026, 3, 20, 10, 0, 0);
    expect(resolveNewExamDueAt('1w', beforeDst)).toBe('2026-03-27T20:59:59.999Z');
  });
});

// Аудит 2026-10-01, F61: две точки ввода срока — пресет бота (Luxon) и поле
// кабинета (shared/src/end-of-day.ts, Intl) — обязаны давать один и тот же
// момент для одной даты, включая дни перехода времени; иначе «2 октября» из
// бота и из кабинета снова разъедутся.
describe('resolveNewExamDueAt — тот же момент, что endOfDayInZoneIso кабинета', () => {
  it.each([
    DateTime.utc(2026, 9, 17, 10, 0, 0),
    DateTime.utc(2026, 3, 20, 10, 0, 0),
    DateTime.utc(2026, 10, 20, 10, 0, 0),
    // Вечер по UTC — по Израилю уже следующий день, дата пресета от него.
    DateTime.utc(2026, 10, 24, 22, 30, 0),
  ])('%s + неделя', (now) => {
    const dueDay = now.setZone(SCHOOL_TZ).plus({ weeks: 1 }).toISODate();
    expect(dueDay).not.toBeNull();
    expect(resolveNewExamDueAt('1w', now)).toBe(
      endOfDayInZoneIso(dueDay ?? '', SCHOOL_TZ),
    );
  });
});
