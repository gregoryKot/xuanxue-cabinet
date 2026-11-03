// Готовый `MeDto` для тестов: все обязательные поля на месте, роль и режимы
// ученика (ADR-0163) и учителя (ADR-0190) переопределяются точечно. Раньше каждый тест писал
// литерал на 14 строк (и jscpd его ловил); новые тесты берут этот.
import type { MeDto } from '@xuanxue/shared';

export function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: [],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    hasEmail: true,
    noTelegram: false,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    teacherMode: false,
    canUseStudentMode: false,
    canUseTeacherMode: false,
    homeHiddenTiles: [],
    ...overrides,
  };
}

/** Учитель, которому доступен режим ученика. */
export const STAFF_ME = makeMe({ roles: ['teacher'], canUseStudentMode: true });

/** Тот же учитель в режиме: действующие роли пустые, режим доступен. */
export const STAFF_IN_STUDENT_MODE_ME = makeMe({
  roles: [],
  studentMode: true,
  teacherMode: false,
  canUseStudentMode: true,
  canUseTeacherMode: false,
});

/** Настоящий ученик: режима у него нет. */
export const STUDENT_ME = makeMe({ id: 'u2', name: 'Ученик' });

/** Разработчик (роль `admin`), которому доступны оба режима. */
export const ADMIN_ME = makeMe({
  roles: ['admin'],
  canUseStudentMode: true,
  canUseTeacherMode: true,
});

/** Тот же разработчик в режиме учителя: действующая роль — учитель (ADR-0190). */
export const ADMIN_IN_TEACHER_MODE_ME = makeMe({
  roles: ['teacher'],
  teacherMode: true,
  canUseStudentMode: true,
  canUseTeacherMode: true,
});
