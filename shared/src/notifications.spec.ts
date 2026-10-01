import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './auth';
import { STUDENT_OPTIONAL_NOTIFICATIONS } from './notification-availability';
import {
  DEFAULT_NOTIFICATIONS_BY_ROLE,
  defaultNotifications,
  isNotificationKind,
  NOTIFICATION_HINTS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LABELS,
  rolesWithNotification,
  STUDENT_NOTIFICATIONS,
} from './notifications';

describe('NOTIFICATION_LABELS / NOTIFICATION_HINTS', () => {
  it('у каждого вида из NOTIFICATION_KINDS есть подпись и подсказка, лишних нет', () => {
    expect(Object.keys(NOTIFICATION_LABELS).sort()).toEqual(
      [...NOTIFICATION_KINDS].sort(),
    );
    expect(Object.keys(NOTIFICATION_HINTS).sort()).toEqual(
      [...NOTIFICATION_KINDS].sort(),
    );
  });

  it('подпись и подсказка — непустые строки', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(NOTIFICATION_LABELS[kind].length).toBeGreaterThan(0);
      expect(NOTIFICATION_HINTS[kind].length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_NOTIFICATIONS_BY_ROLE', () => {
  it('у каждой роли из USER_ROLES есть набор дефолтов, лишних ролей нет', () => {
    expect(Object.keys(DEFAULT_NOTIFICATIONS_BY_ROLE).sort()).toEqual(
      [...USER_ROLES].sort(),
    );
  });

  it('учитель и помощник учителя равны', () => {
    expect(DEFAULT_NOTIFICATIONS_BY_ROLE.assistant).toEqual(
      DEFAULT_NOTIFICATIONS_BY_ROLE.teacher,
    );
  });

  it('админ получает набор учителя без «работа на проверку», но со «сбоем в кабинете» — админ не проверяет работы, но чинит сбои', () => {
    expect(DEFAULT_NOTIFICATIONS_BY_ROLE.admin).toEqual([
      ...DEFAULT_NOTIFICATIONS_BY_ROLE.teacher.filter(
        (kind) => kind !== 'attempt_submitted',
      ),
      'app_error',
    ]);
  });

  it('только у админа есть «сбой в кабинете» — остальным чинить нечего', () => {
    expect(DEFAULT_NOTIFICATIONS_BY_ROLE.teacher).not.toContain('app_error');
    expect(DEFAULT_NOTIFICATIONS_BY_ROLE.assistant).not.toContain('app_error');
    expect(DEFAULT_NOTIFICATIONS_BY_ROLE.accountant).not.toContain('app_error');
    expect(STUDENT_NOTIFICATIONS).not.toContain('app_error');
  });

  it('у каждой роли набор непустой — бот всегда может показать хотя бы один переключатель', () => {
    for (const role of USER_ROLES) {
      expect(DEFAULT_NOTIFICATIONS_BY_ROLE[role].length).toBeGreaterThan(0);
    }
  });
});

describe('defaultNotifications', () => {
  it('ученик (без ролей) — результат экзамена, напоминание и отмена занятия, напоминание об оплате (ADR-0135, ADR-0162, ADR-0150)', () => {
    expect(defaultNotifications([])).toEqual(STUDENT_NOTIFICATIONS);
    expect(STUDENT_NOTIFICATIONS).toEqual([
      'exam_result',
      'lesson_soon',
      'lesson_cancelled',
      'payment_due',
    ]);
  });

  // ADR-0162: «Занятие отменено» включён ученику без единого переключения
  // руками, а штату он не положен — отмену занятий школы учитель делает сам.
  it('lesson_cancelled — только у ученика, ни у одной роли', () => {
    expect(rolesWithNotification('lesson_cancelled')).toEqual([]);
    for (const role of USER_ROLES) {
      expect(defaultNotifications([role])).not.toContain('lesson_cancelled');
    }
    expect(NOTIFICATION_LABELS.lesson_cancelled).toBe('Занятие отменено');
    expect(NOTIFICATION_HINTS.lesson_cancelled).toContain('отменит занятие');
  });

  // ADR-0069: вид без доставки — переключатель, который врёт. Проверяем не
  // «нет строки lesson_soon» (такой тест не переживёт следующего удаления), а
  // само условие входа в список: у каждого вида есть либо получатель по роли,
  // либо он ученический.
  it('у каждого вида есть получатель: роль по умолчанию, ученик или ученик «по желанию»', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const hasRole = rolesWithNotification(kind).length > 0;
      const isStudentKind =
        STUDENT_NOTIFICATIONS.includes(kind) ||
        STUDENT_OPTIONAL_NOTIFICATIONS.includes(kind);
      expect(hasRole || isStudentKind).toBe(true);
    }
  });

  // ADR-0162: «Запись занятия» ученик включает сам. Выключен у всех по
  // умолчанию — ни в дефолте ученика, ни в дефолте любой роли.
  it('recording_ready — вид «по желанию»: не в дефолте ни у кого, подпись и подсказка есть', () => {
    expect(defaultNotifications([])).not.toContain('recording_ready');
    for (const role of USER_ROLES) {
      expect(defaultNotifications([role])).not.toContain('recording_ready');
    }
    expect(rolesWithNotification('recording_ready')).toEqual([]);
    expect(NOTIFICATION_LABELS.recording_ready).toBe('Запись занятия');
    expect(NOTIFICATION_HINTS.recording_ready).toContain('добавит запись занятия');
    expect(NOTIFICATION_HINTS.recording_ready).not.toContain('**');
  });

  // ADR-0162: «Новый материал» — второй вид «по желанию», тем же способом.
  it('material_new — вид «по желанию»: не в дефолте ни у кого, подпись и подсказка есть', () => {
    expect(defaultNotifications([])).not.toContain('material_new');
    for (const role of USER_ROLES) {
      expect(defaultNotifications([role])).not.toContain('material_new');
    }
    expect(rolesWithNotification('material_new')).toEqual([]);
    expect(NOTIFICATION_LABELS.material_new).toBe('Новый материал');
    expect(NOTIFICATION_HINTS.material_new).toContain('добавит в библиотеку материал');
    expect(NOTIFICATION_HINTS.material_new).not.toContain('**');
  });

  it('учитель — черновик, запрос записи, сбой отправки, работа на проверку', () => {
    expect(defaultNotifications(['teacher'])).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
      'attempt_submitted',
    ]);
  });

  it('бухгалтер — только оплаты', () => {
    expect(defaultNotifications(['accountant'])).toEqual(['payments']);
  });

  it('две роли — объединение наборов, в каноническом порядке', () => {
    expect(defaultNotifications(['accountant', 'teacher'])).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
      'attempt_submitted',
      'payments',
    ]);
  });

  it('пересекающиеся роли не дают дублей', () => {
    expect(defaultNotifications(['teacher', 'admin'])).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
      'attempt_submitted',
      'app_error',
    ]);
  });

  it('вторая роль добавляет вид, которого нет у первой (админ + учитель — вместе с «работа на проверку»)', () => {
    expect(defaultNotifications(['admin', 'teacher'])).toContain('attempt_submitted');
    expect(defaultNotifications(['admin'])).not.toContain('attempt_submitted');
  });

  it('вторая роль добавляет вид, которого нет у второй (учитель + админ — вместе со «сбоем в кабинете»)', () => {
    expect(defaultNotifications(['teacher', 'admin'])).toContain('app_error');
    expect(defaultNotifications(['teacher'])).not.toContain('app_error');
  });
});

describe('rolesWithNotification', () => {
  it('payments — только бухгалтер (регрессия: раньше PersonalChats.listFor не искал его вовсе)', () => {
    expect(rolesWithNotification('payments')).toEqual(['accountant']);
  });

  it('payment_due — ученический вид: ни одной роли, получатель — человек без ролей', () => {
    expect(rolesWithNotification('payment_due')).toEqual([]);
    expect(STUDENT_NOTIFICATIONS).toContain('payment_due');
  });

  it('post_draft — админ, учитель, помощник в каноническом порядке USER_ROLES', () => {
    expect(rolesWithNotification('post_draft')).toEqual([
      'admin',
      'teacher',
      'assistant',
    ]);
  });

  it('attempt_submitted — без админа: он этот вид не получает (см. комментарий в DEFAULT_NOTIFICATIONS_BY_ROLE)', () => {
    expect(rolesWithNotification('attempt_submitted')).toEqual(['teacher', 'assistant']);
  });

  it('вид, которого нет ни у одной роли (ученический exam_result), — пустой массив', () => {
    expect(rolesWithNotification('exam_result')).toEqual([]);
  });
});

describe('isNotificationKind', () => {
  it('каждый вид из NOTIFICATION_KINDS проходит проверку', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(isNotificationKind(kind)).toBe(true);
    }
  });

  it('чужая/битая строка — false, не бросает', () => {
    expect(isNotificationKind('payment')).toBe(false);
    expect(isNotificationKind('')).toBe(false);
    expect(isNotificationKind('__proto__')).toBe(false);
  });
});
