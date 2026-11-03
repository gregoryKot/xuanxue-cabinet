// Чистая логика режимов ученика и учителя (ADR-0163, ADR-0190): без Mongo и без DI.
import type { UserRole } from '@xuanxue/shared';
import {
  activeMode,
  actingUser,
  isStudentModeOn,
  isTeacherModeOn,
  STAFF_ROLE_LIST,
} from './acting-mode';

const MOMENT = new Date('2026-10-01T10:00:00Z');

interface Person {
  id: string;
  roles: UserRole[];
  studentMode: boolean;
  teacherMode: boolean;
}

function person(
  roles: UserRole[],
  modes: { studentMode?: boolean; teacherMode?: boolean } = {},
): Person {
  return { id: 'u1', roles, studentMode: false, teacherMode: false, ...modes };
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

describe('isTeacherModeOn', () => {
  it('флаг стоит и роль admin настоящая — режим включён', () => {
    expect(isTeacherModeOn(MOMENT, ['admin'])).toBe(true);
    expect(isTeacherModeOn(MOMENT, ['teacher', 'admin'])).toBe(true);
  });

  it('флага нет — режима нет, сколько бы ролей ни было', () => {
    expect(isTeacherModeOn(undefined, ['admin'])).toBe(false);
  });

  it('флаг застрял без admin — не режим: бывший разработчик не остаётся учителем', () => {
    expect(isTeacherModeOn(MOMENT, [])).toBe(false);
    expect(isTeacherModeOn(MOMENT, ['teacher'])).toBe(false);
    expect(isTeacherModeOn(MOMENT, ['assistant', 'accountant'])).toBe(false);
  });
});

describe('STAFF_ROLE_LIST', () => {
  it('ровно штат из isStaffRole: учитель, помощник, админ — без бухгалтера', () => {
    expect([...STAFF_ROLE_LIST].sort()).toEqual(['admin', 'assistant', 'teacher']);
  });
});

describe('activeMode', () => {
  it('ни один флаг не стоит — режима нет', () => {
    expect(activeMode(person(['admin']))).toBeNull();
  });

  it('стоит один — он и действует', () => {
    expect(activeMode(person(['admin'], { studentMode: true }))).toBe('student');
    expect(activeMode(person(['admin'], { teacherMode: true }))).toBe('teacher');
  });

  it('оба разом (правка в Atlas) — побеждает ученик: пустые роли уже, чем учитель', () => {
    expect(activeMode(person(['admin'], { studentMode: true, teacherMode: true }))).toBe(
      'student',
    );
  });
});

describe('actingUser', () => {
  it('в режиме ученика роли пустые, остальные поля те же', () => {
    const real = person(['admin', 'teacher'], { studentMode: true });

    expect(actingUser(real)).toEqual({
      id: 'u1',
      roles: [],
      studentMode: true,
      teacherMode: false,
    });
  });

  it('в режиме учителя роли — ровно [teacher], остальные поля те же', () => {
    const real = person(['admin'], { teacherMode: true });

    expect(actingUser(real)).toEqual({
      id: 'u1',
      roles: ['teacher'],
      studentMode: false,
      teacherMode: true,
    });
  });

  it('оба флага — побеждает ученик, роли пустые', () => {
    const real = person(['admin'], { studentMode: true, teacherMode: true });

    expect(actingUser(real).roles).toEqual([]);
  });

  it('настоящий объект не мутируется: роли в нём остаются прежними', () => {
    const asStudent = person(['admin'], { studentMode: true });
    const asTeacher = person(['admin', 'accountant'], { teacherMode: true });

    actingUser(asStudent);
    actingUser(asTeacher);

    expect(asStudent.roles).toEqual(['admin']);
    expect(asTeacher.roles).toEqual(['admin', 'accountant']);
  });

  it('без режима возвращает того же человека, роли целые', () => {
    const real = person(['teacher']);

    expect(actingUser(real)).toBe(real);
  });

  it('ученик без ролей остаётся с пустыми: режим ничего не прибавляет', () => {
    expect(actingUser(person([])).roles).toEqual([]);
    expect(actingUser(person([], { studentMode: true })).roles).toEqual([]);
  });

  it.each([
    ['ученика', { studentMode: true }],
    ['учителя', { teacherMode: true }],
  ])(
    'идемпотентна в режиме %s: повторный вызов на замаскированном ничего не меняет',
    (_, mode) => {
      const once = actingUser(person(['admin'], mode));

      expect(actingUser(once)).toEqual(once);
    },
  );
});
