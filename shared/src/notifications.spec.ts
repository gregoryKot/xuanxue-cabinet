import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './auth';
import {
  DEFAULT_NOTIFICATIONS_BY_ROLE,
  defaultNotifications,
  NOTIFICATION_HINTS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LABELS,
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

  it('админ получает набор учителя', () => {
    expect(DEFAULT_NOTIFICATIONS_BY_ROLE.admin).toEqual(
      DEFAULT_NOTIFICATIONS_BY_ROLE.teacher,
    );
  });
});

describe('defaultNotifications', () => {
  it('ученик — занятие скоро и сообщение от учителя', () => {
    expect(defaultNotifications(['student'])).toEqual(['lesson_soon', 'teacher_message']);
  });

  it('учитель — черновик, запрос записи, сбой отправки', () => {
    expect(defaultNotifications(['teacher'])).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
    ]);
  });

  it('бухгалтер — только оплаты', () => {
    expect(defaultNotifications(['accountant'])).toEqual(['payments']);
  });

  it('без ролей (гость) — как у ученика', () => {
    expect(defaultNotifications([])).toEqual(defaultNotifications(['student']));
  });

  it('две роли — объединение наборов, в каноническом порядке', () => {
    expect(defaultNotifications(['accountant', 'teacher'])).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
      'payments',
    ]);
  });

  it('пересекающиеся роли не дают дублей', () => {
    expect(defaultNotifications(['teacher', 'admin'])).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
    ]);
  });
});
