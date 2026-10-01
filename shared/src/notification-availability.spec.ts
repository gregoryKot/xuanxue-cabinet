import { describe, expect, it } from 'vitest';
import { USER_ROLES } from './auth';
import {
  availableNotifications,
  STUDENT_OPTIONAL_NOTIFICATIONS,
} from './notification-availability';
import {
  defaultNotifications,
  NOTIFICATION_KINDS,
  STUDENT_NOTIFICATIONS,
} from './notifications';

describe('STUDENT_OPTIONAL_NOTIFICATIONS', () => {
  it('«по желанию» — ровно «Запись занятия»', () => {
    expect(STUDENT_OPTIONAL_NOTIFICATIONS).toEqual(['recording_ready']);
  });

  // Вид в обоих списках был бы включён сам и «по желанию» одновременно.
  it('не пересекается с дефолтом ученика', () => {
    for (const kind of STUDENT_OPTIONAL_NOTIFICATIONS) {
      expect(STUDENT_NOTIFICATIONS).not.toContain(kind);
    }
  });

  it('каждый вид — настоящий вид уведомления', () => {
    for (const kind of STUDENT_OPTIONAL_NOTIFICATIONS) {
      expect(NOTIFICATION_KINDS).toContain(kind);
    }
  });
});

describe('availableNotifications', () => {
  it('ученик — дефолт плюс «Запись занятия», в каноническом порядке', () => {
    expect(availableNotifications([])).toEqual([
      'exam_result',
      'lesson_soon',
      'lesson_cancelled',
      'recording_ready',
      'payment_due',
    ]);
  });

  it('дефолт ученика целиком входит в доступное', () => {
    for (const kind of defaultNotifications([])) {
      expect(availableNotifications([])).toContain(kind);
    }
  });

  it.each(USER_ROLES)('штат (%s) — ровно дефолт роли, вида «по желанию» нет', (role) => {
    expect(availableNotifications([role])).toEqual(defaultNotifications([role]));
    expect(availableNotifications([role])).not.toContain('recording_ready');
  });

  it('несколько ролей — объединение дефолтов без видов «по желанию»', () => {
    expect(availableNotifications(['teacher', 'accountant'])).toEqual(
      defaultNotifications(['teacher', 'accountant']),
    );
  });
});
