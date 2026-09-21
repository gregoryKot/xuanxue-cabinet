// Чистая функция, без Mongo и без DI (CLAUDE.md «Тесты» — юнит без Mongo и
// без DI). Все четыре сочетания access × роль — таблицей, чтобы не потерять
// ни одну ветку при следующей правке.
import { isMaterialHiddenFromStudent } from './material-access';

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
