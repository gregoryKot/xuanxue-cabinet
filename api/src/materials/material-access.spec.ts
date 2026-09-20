// Чистая функция, без Mongo и без DI (CLAUDE.md «Тесты» — юнит без Mongo и
// без DI). Все двенадцать сочетаний access × рубильник × роль — таблицей,
// чтобы не потерять ни одну ветку при следующей правке.
import { isMaterialLocked } from './material-access';

describe('isMaterialLocked (ADR-0048, ADR-0058)', () => {
  it.each([
    // access, paidAccessEnabled, isStaff, ожидаемый результат
    ['all', false, false, false],
    ['all', false, true, false],
    ['all', true, false, false],
    ['all', true, true, false],
    ['paid', false, false, false],
    ['paid', false, true, false],
    ['paid', true, false, true],
    ['paid', true, true, false],
    ['staff', false, false, true],
    ['staff', false, true, false],
    ['staff', true, false, true],
    ['staff', true, true, false],
  ] as const)(
    'access=%s, paidAccessEnabled=%s, isStaff=%s → locked=%s',
    (access, paidAccessEnabled, isStaff, expected) => {
      expect(isMaterialLocked({ access, paidAccessEnabled, isStaff })).toBe(expected);
    },
  );
});
