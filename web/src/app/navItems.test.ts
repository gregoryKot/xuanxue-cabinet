import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import {
  ACCOUNTANT_NAV_ITEMS,
  activeSectionPath,
  navItemsFor,
  STAFF_NAV_ITEMS,
  STUDENT_NAV_ITEMS,
} from './navItems';

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    noTelegram: false,
    hasEmail: true,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    canUseStudentMode: false,
    ...overrides,
  };
}

describe('navItemsFor', () => {
  it('штат — STAFF_NAV_ITEMS', () => {
    expect(navItemsFor(makeMe({ roles: ['teacher'] }))).toBe(STAFF_NAV_ITEMS);
    expect(navItemsFor(makeMe({ roles: ['assistant'] }))).toBe(STAFF_NAV_ITEMS);
    expect(navItemsFor(makeMe({ roles: ['admin'] }))).toBe(STAFF_NAV_ITEMS);
  });

  it('ученик (нет роли штата) — STUDENT_NAV_ITEMS', () => {
    expect(navItemsFor(makeMe({ roles: [] }))).toBe(STUDENT_NAV_ITEMS);
  });

  it('бухгалтер без ролей штата — ACCOUNTANT_NAV_ITEMS (ADR-0171)', () => {
    expect(navItemsFor(makeMe({ roles: ['accountant'] }))).toBe(ACCOUNTANT_NAV_ITEMS);
  });

  it('бухгалтер с ролью штата — список штата', () => {
    expect(navItemsFor(makeMe({ roles: ['accountant', 'admin'] }))).toBe(STAFF_NAV_ITEMS);
  });

  it('сессия ещё не известна (null) — тот же список, что у ученика', () => {
    expect(navItemsFor(null)).toBe(STUDENT_NAV_ITEMS);
  });
});

// ADR-0174 (заменяет ADR-0138): «Доска» — первый пункт штата и его корень;
// расписание, рассылки и материалы вынесены из панели в «Настроить» на доске.
describe('STAFF_NAV_ITEMS — состав и порядок (ADR-0174)', () => {
  it('«Доска», «Экзамены», «Ученики» — три пункта, «Доска» первой', () => {
    expect(STAFF_NAV_ITEMS.map((item) => item.to)).toEqual([
      '/board',
      '/exams',
      '/people',
    ]);
    expect(STAFF_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Доска',
      'Экзамены',
      'Ученики',
    ]);
  });
});

describe('activeSectionPath — список штата', () => {
  it('«Доска» подсвечивает сама себя', () => {
    expect(activeSectionPath('/board', STAFF_NAV_ITEMS)).toBe('/board');
  });

  it('/planning, /schedule, /broadcasts, /channels, /templates — подэкраны «Доски»', () => {
    for (const path of [
      '/planning',
      '/schedule',
      '/broadcasts',
      '/channels',
      '/templates',
    ]) {
      expect(activeSectionPath(path, STAFF_NAV_ITEMS)).toBe('/board');
    }
  });

  // ADR-0055/0075: материалы и теги — входы из «Настроить» на доске.
  it('/materials и /materials/tags — подэкраны «Доски»', () => {
    expect(activeSectionPath('/materials', STAFF_NAV_ITEMS)).toBe('/board');
    expect(activeSectionPath('/materials/tags', STAFF_NAV_ITEMS)).toBe('/board');
  });

  it('/exams подсвечивает сам себя, /exam-items и /grading — его подэкраны', () => {
    expect(activeSectionPath('/exams', STAFF_NAV_ITEMS)).toBe('/exams');
    expect(activeSectionPath('/exam-items', STAFF_NAV_ITEMS)).toBe('/exams');
    expect(activeSectionPath('/grading', STAFF_NAV_ITEMS)).toBe('/exams');
  });

  // ADR-0171: «Оплаты» подсвечивают «Учеников».
  it('/payments — подэкран «Учеников»', () => {
    expect(activeSectionPath('/payments', STAFF_NAV_ITEMS)).toBe('/people');
  });

  it('путь вне навигации — null', () => {
    expect(activeSectionPath('/login', STAFF_NAV_ITEMS)).toBeNull();
  });
});

// ADR-0097: значок нижней панели телефона — обязательное поле пункта, а не
// опциональное украшение, и в пределах одного списка значки не повторяются
// (иначе на телефоне два раздела выглядели бы одинаково).
describe('NavItem.icon (ADR-0097)', () => {
  it('у каждого пункта всех трёх списков есть значок', () => {
    for (const item of [
      ...STAFF_NAV_ITEMS,
      ...STUDENT_NAV_ITEMS,
      ...ACCOUNTANT_NAV_ITEMS,
    ]) {
      expect(item.icon).toBeTruthy();
    }
  });

  it('внутри списка штата значки не повторяются', () => {
    const icons = STAFF_NAV_ITEMS.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('внутри списка ученика значки не повторяются', () => {
    const icons = STUDENT_NAV_ITEMS.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('activeSectionPath — список бухгалтера', () => {
  it('«Оплаты» подсвечивают себя', () => {
    expect(activeSectionPath('/payments', ACCOUNTANT_NAV_ITEMS)).toBe('/payments');
  });

  it('маршрут штата — вне списка бухгалтера, null', () => {
    expect(activeSectionPath('/people', ACCOUNTANT_NAV_ITEMS)).toBeNull();
  });
});

describe('STUDENT_NAV_ITEMS — порядок (ADR-0173)', () => {
  it('«Доска», «Задания», «Занятия» — три пункта, «Доска» первым', () => {
    expect(STUDENT_NAV_ITEMS.map((item) => item.to)).toEqual([
      '/board',
      '/tasks',
      '/lessons',
    ]);
    expect(STUDENT_NAV_ITEMS[0]?.label).toBe('Доска');
  });
});

describe('activeSectionPath — список ученика', () => {
  it('«Доска», «Задания» и «Занятия» подсвечивают себя', () => {
    expect(activeSectionPath('/board', STUDENT_NAV_ITEMS)).toBe('/board');
    expect(activeSectionPath('/tasks', STUDENT_NAV_ITEMS)).toBe('/tasks');
    expect(activeSectionPath('/lessons', STUDENT_NAV_ITEMS)).toBe('/lessons');
  });

  // Слой 3.3 (docs/PLAN.md §14) — «/archive» подэкран «Занятий»
  // (ADR-0025): вкладка «Занятия» остаётся подсвеченной.
  it('/archive — подэкран «Занятий»', () => {
    expect(activeSectionPath('/archive', STUDENT_NAV_ITEMS)).toBe('/lessons');
  });

  // Слой 3.2 (docs/PLAN.md §14) — «/library» тоже подэкран «Занятий».
  it('/library — подэкран «Занятий»', () => {
    expect(activeSectionPath('/library', STUDENT_NAV_ITEMS)).toBe('/lessons');
  });

  it('маршрут штата — вне списка ученика, null', () => {
    expect(activeSectionPath('/planning', STUDENT_NAV_ITEMS)).toBeNull();
  });
});
