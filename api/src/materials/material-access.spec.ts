// Чистая функция, без Mongo и без DI (CLAUDE.md «Тесты» — юнит без Mongo и
// без DI). Все четыре сочетания access × роль — таблицей, чтобы не потерять
// ни одну ветку при следующей правке.
import { isMaterialHiddenFromStudent, visibleForStudent } from './material-access';

describe('isMaterialHiddenFromStudent (ADR-0096, ADR-0058)', () => {
  it.each([
    // access, isStaff, ожидаемый результат
    ['all', false, false],
    ['all', true, false],
    ['staff', false, true],
    ['staff', true, false],
  ] as const)('access=%s, isStaff=%s → hidden=%s', (access, isStaff, expected) => {
    expect(isMaterialHiddenFromStudent({ access, isStaff })).toBe(expected);
  });
});

// Страховка из ADR-0096: в самих сервисах эта ветка недостижима — `staff`
// отсекает запрос Mongo раньше, — поэтому её сторожит этот тест, а не
// покрытие сервисов.
describe('visibleForStudent (ADR-0096 «Решение»)', () => {
  const all = { access: 'all', title: 'Открытый' } as const;
  const staffOnly = { access: 'staff', title: 'Служебный' } as const;

  it('ученику служебный материал не достаётся, даже если дошёл до маппинга', () => {
    expect(visibleForStudent([all, staffOnly], false)).toEqual([all]);
  });

  it('штату школы достаются оба', () => {
    expect(visibleForStudent([all, staffOnly], true)).toEqual([all, staffOnly]);
  });

  it('пустой список остаётся пустым', () => {
    expect(visibleForStudent([], false)).toEqual([]);
  });
});
