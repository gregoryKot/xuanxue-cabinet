// Кому уходит «работу проверили» в ленту и push (ADR-0061, ADR-0092): человек
// с включённым видом. Чистая логика с фейками — без Mongo и DI. Режим ученика
// (ADR-0163): штат в нём ждёт виды ученика, а не штатные.
import { defaultNotifications, type UserRole } from '@xuanxue/shared';
import type { UserLean, UsersService } from '../users/users.service';
import type { NotificationPrefsService } from './notification-prefs.service';
import { findNotifiedUser } from './notified-user';

function person(roles: UserRole[], studentMode: boolean): UserLean {
  return { id: 'u1', name: 'Мария', roles, status: 'active', studentMode };
}

// Фейк повторяет суть NotificationPrefsService.get: дефолт по переданным ролям.
function deps(user: UserLean | null): {
  usersService: UsersService;
  notificationPrefsService: NotificationPrefsService;
} {
  return {
    usersService: { findById: () => Promise.resolve(user) } as unknown as UsersService,
    notificationPrefsService: {
      get: (_id: string, roles: UserRole[]) =>
        Promise.resolve({ enabled: defaultNotifications(roles) }),
    } as unknown as NotificationPrefsService,
  };
}

describe('findNotifiedUser', () => {
  it('ученик получает exam_result по дефолту', async () => {
    const student = person([], false);

    await expect(findNotifiedUser(deps(student), 'u1', 'exam_result')).resolves.toBe(
      student,
    );
  });

  it('учитель без режима exam_result не получает: у штата такого вида нет', async () => {
    await expect(
      findNotifiedUser(deps(person(['teacher'], false)), 'u1', 'exam_result'),
    ).resolves.toBeNull();
  });

  it('учитель в режиме ученика получает exam_result: действующие роли пустые', async () => {
    const teacher = person(['teacher'], true);

    await expect(findNotifiedUser(deps(teacher), 'u1', 'exam_result')).resolves.toBe(
      teacher,
    );
  });

  it('аккаунта нет — null', async () => {
    await expect(findNotifiedUser(deps(null), 'u1', 'exam_result')).resolves.toBeNull();
  });
});
