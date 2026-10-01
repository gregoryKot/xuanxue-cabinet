// Чистая логика режима ученика (ADR-0163): без Mongo и без DI.
import type { UserRole } from '@xuanxue/shared';
import { actingUser, isStudentModeOn, STAFF_ROLE_LIST } from './student-mode';

const MOMENT = new Date('2026-10-01T10:00:00Z');

function person(
  roles: UserRole[],
  studentMode: boolean,
): {
  id: string;
  roles: UserRole[];
  studentMode: boolean;
} {
  return { id: 'u1', roles, studentMode };
}

describe('isStudentModeOn', () => {
  it('флаг стоит и роль штата настоящая — режим включён', () => {
    expect(isStudentModeOn(MOMENT, ['teacher'])).toBe(true);
    expect(isStudentModeOn(MOMENT, ['accountant', 'admin'])).toBe(true);
  });

  it('флага нет — режима нет, сколько бы ролей ни было', () => {
    expect(isStudentModeOn(undefined, ['admin'])).toBe(false);
  });

  it('флаг застрял без роли штата — не режим: бывший учитель и бухгалтер не залипают', () => {
    expect(isStudentModeOn(MOMENT, [])).toBe(false);
    expect(isStudentModeOn(MOMENT, ['accountant'])).toBe(false);
  });
});

describe('STAFF_ROLE_LIST', () => {
  it('ровно штат из isStaffRole: учитель, помощник, админ — без бухгалтера', () => {
    expect([...STAFF_ROLE_LIST].sort()).toEqual(['admin', 'assistant', 'teacher']);
  });
});

describe('actingUser', () => {
  it('в режиме ученика роли пустые, остальные поля те же', () => {
    const real = person(['admin', 'teacher'], true);

    expect(actingUser(real)).toEqual({ id: 'u1', roles: [], studentMode: true });
  });

  it('настоящий объект не мутируется: роли в нём остаются прежними', () => {
    const real = person(['admin'], true);

    actingUser(real);

    expect(real.roles).toEqual(['admin']);
  });

  it('без режима возвращает того же человека, роли целые', () => {
    const real = person(['teacher'], false);

    expect(actingUser(real)).toBe(real);
  });

  it('ученик без ролей остаётся с пустыми: режим ничего не прибавляет', () => {
    expect(actingUser(person([], false)).roles).toEqual([]);
  });

  it('идемпотентна: повторный вызов на замаскированном ничего не меняет', () => {
    const once = actingUser(person(['admin'], true));

    expect(actingUser(once)).toEqual(once);
  });
});
