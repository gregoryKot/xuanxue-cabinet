import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './auth';
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
  it('ученик (без ролей) — занятие скоро, сообщение от учителя, результат экзамена', () => {
    expect(defaultNotifications([])).toEqual(STUDENT_NOTIFICATIONS);
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

  it('вид, которого нет ни у одной роли (ученические lesson_soon/teacher_message/exam_result), — пустой массив', () => {
    expect(rolesWithNotification('lesson_soon')).toEqual([]);
    expect(rolesWithNotification('teacher_message')).toEqual([]);
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
