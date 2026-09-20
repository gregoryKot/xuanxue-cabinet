// Test.createTestingModule с фейком сервиса — образец exam-attempts.controller.spec.ts:
// без HTTP, без Mongo. Владение и роли (доступ у гостя/ученика) проверяет
// e2e (notifications-ownership.e2e-spec.ts) на настоящем гварде — здесь
// только «контроллер зовёт сервис с userId/roles из сессии и отдаёт ответ».
import { Test } from '@nestjs/testing';
import type { NotificationPrefsDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { UpdateNotificationPrefsDto } from './dto/update-notification-prefs.dto';
import { NotificationPrefsController } from './notification-prefs.controller';
import { NotificationPrefsService } from './notification-prefs.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const PREFS_DTO: NotificationPrefsDto = { enabled: ['lesson_soon', 'teacher_message'] };

async function buildController(
  service: Partial<NotificationPrefsService> = {},
): Promise<NotificationPrefsController> {
  const module = await Test.createTestingModule({
    controllers: [NotificationPrefsController],
    providers: [{ provide: NotificationPrefsService, useValue: service }],
  }).compile();
  return module.get(NotificationPrefsController);
}

describe('NotificationPrefsController', () => {
  it('get() передаёт id и роли пользователя из сессии в сервис', async () => {
    const get = jest.fn().mockResolvedValue(PREFS_DTO);
    const controller = await buildController({ get });

    await expect(controller.get(USER)).resolves.toEqual(PREFS_DTO);
    expect(get).toHaveBeenCalledWith(USER.id, USER.roles);
  });

  it('update() сохраняет переключатель и возвращает свежий набор', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    const get = jest.fn().mockResolvedValue(PREFS_DTO);
    const controller = await buildController({ set, get });
    const body: UpdateNotificationPrefsDto = { kind: 'teacher_message', enabled: false };

    await expect(controller.update(body, USER)).resolves.toEqual(PREFS_DTO);
    expect(set).toHaveBeenCalledWith(USER.id, body.kind, body.enabled);
    expect(get).toHaveBeenCalledWith(USER.id, USER.roles);
  });
});
