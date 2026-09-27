// Три чистые функции одного поля формы (ADR-0125, дополнено ADR-0139: только
// дата, без времени). Пояс зрителя фиксирован через stubViewerTimeZone —
// иначе значение `<input type="date">` и итоговый ISO зависели бы от пояса
// машины CI. Отдельный DST-тест — переход летнего времени Asia/Jerusalem не
// должен сдвигать «конец дня» на соседние сутки (CLAUDE.md «Время»).
import { describe, expect, it } from 'vitest';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { dueDateToIso, initialDueDate, validateDueDateText } from './examDueInput';

stubViewerTimeZone('Asia/Jerusalem');

describe('initialDueDate', () => {
  it('нет срока — пустая строка', () => {
    expect(initialDueDate(undefined)).toBe('');
  });

  it('есть срок — дата без времени, в поясе зрителя', () => {
    // 20:59:59.999Z — конец 2026-03-27 по Asia/Jerusalem (+3, летнее время).
    expect(initialDueDate('2026-03-27T20:59:59.999Z')).toBe('2026-03-27');
  });
});

describe('validateDueDateText', () => {
  it('пусто — валидно (без срока)', () => {
    expect(validateDueDateText('')).toBeNull();
  });

  it('корректная дата — валидно', () => {
    expect(validateDueDateText('2026-09-30')).toBeNull();
  });

  it('нераспознаваемая строка — ошибка', () => {
    expect(validateDueDateText('не дата')).toMatch(/Срок сдачи/);
  });

  it('календарно невозможная дата (13-й месяц) — ошибка, а не перенос на соседний месяц', () => {
    expect(validateDueDateText('2026-13-01')).toMatch(/Срок сдачи/);
  });

  it('календарно невозможный день (31 апреля) — ошибка', () => {
    expect(validateDueDateText('2026-04-31')).toMatch(/Срок сдачи/);
  });
});

describe('dueDateToIso', () => {
  it('пусто — undefined (поле не отправляется)', () => {
    expect(dueDateToIso('')).toBeUndefined();
  });

  it('заполнено — ISO UTC конца дня (23:59:59.999) в поясе зрителя', () => {
    // Обычный день вне перехода: Asia/Jerusalem зимой — UTC+2.
    expect(dueDateToIso('2026-01-15')).toBe('2026-01-15T21:59:59.999Z');
  });

  it('круговой обход — initialDueDate(dueDateToIso(x)) возвращает тот же день', () => {
    const iso = dueDateToIso('2026-06-10');
    expect(initialDueDate(iso)).toBe('2026-06-10');
  });

  // Переход на летнее время (2026-03-27, Asia/Jerusalem: 02:00 → 03:00) —
  // «до конца дня» остаётся концом ИМЕННО этого дня, не съезжает на соседний
  // из-за часа, которого не хватило сутками.
  it('переход на летнее время — конец дня по смещению, действующему в 23:59', () => {
    expect(dueDateToIso('2026-03-27')).toBe('2026-03-27T20:59:59.999Z');
    expect(initialDueDate('2026-03-27T20:59:59.999Z')).toBe('2026-03-27');
  });

  // Переход на зимнее время (2026-10-25, Asia/Jerusalem: 03:00 → 02:00).
  it('переход на зимнее время — тот же день, другое смещение', () => {
    expect(dueDateToIso('2026-10-25')).toBe('2026-10-25T21:59:59.999Z');
    expect(initialDueDate('2026-10-25T21:59:59.999Z')).toBe('2026-10-25');
  });
});
