// Пресеты срока сдачи (ADR-0125, ADR-0127) — чистая логика, без Mongo и без
// Telegram (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
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
