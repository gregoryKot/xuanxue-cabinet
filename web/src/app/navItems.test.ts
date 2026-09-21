import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import {
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

  it('сессия ещё не известна (null) — тот же список, что у ученика', () => {
    expect(navItemsFor(null)).toBe(STUDENT_NAV_ITEMS);
  });
});

describe('activeSectionPath — список штата', () => {
  it('сам раздел подсвечивает себя', () => {
    expect(activeSectionPath('/planning', STAFF_NAV_ITEMS)).toBe('/planning');
  });

  it('/schedule — подэкран «Занятий»', () => {
    expect(activeSectionPath('/schedule', STAFF_NAV_ITEMS)).toBe('/planning');
  });

  it('/channels и /templates — подэкраны «Рассылок»', () => {
    expect(activeSectionPath('/channels', STAFF_NAV_ITEMS)).toBe('/broadcasts');
    expect(activeSectionPath('/templates', STAFF_NAV_ITEMS)).toBe('/broadcasts');
  });

  it('/exam-items и /grading — подэкраны «Экзаменов»', () => {
    expect(activeSectionPath('/exam-items', STAFF_NAV_ITEMS)).toBe('/exams');
    expect(activeSectionPath('/grading', STAFF_NAV_ITEMS)).toBe('/exams');
  });

  // ADR-0055 — пятый пункт штата, подсвечивает сам себя, как и остальные.
  it('/materials подсвечивает сам себя', () => {
    expect(activeSectionPath('/materials', STAFF_NAV_ITEMS)).toBe('/materials');
  });

  // ADR-0075 — «Теги» подэкран «Материалов», тот же приём, что у
  // «/archive»/«/library» под «Занятиями» ученика ниже.
  it('/materials/tags — подэкран «Материалов»', () => {
    expect(activeSectionPath('/materials/tags', STAFF_NAV_ITEMS)).toBe('/materials');
  });

  it('путь вне навигации — null', () => {
    expect(activeSectionPath('/login', STAFF_NAV_ITEMS)).toBeNull();
  });
});

// ADR-0097: значок нижней панели телефона — обязательное поле пункта, а не
// опциональное украшение, и в пределах одного списка значки не повторяются
// (иначе на телефоне два раздела выглядели бы одинаково).
describe('NavItem.icon (ADR-0097)', () => {
  it('у каждого пункта обоих списков есть значок', () => {
    for (const item of [...STAFF_NAV_ITEMS, ...STUDENT_NAV_ITEMS]) {
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

describe('activeSectionPath — список ученика', () => {
  it('«Задания» и «Занятия» подсвечивают себя', () => {
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
