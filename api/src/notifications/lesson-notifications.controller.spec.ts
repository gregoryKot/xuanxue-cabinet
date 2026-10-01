// Фейк сервиса, без HTTP и Mongo (образец — notification-prefs.controller.spec.ts):
// здесь только «контроллер зовёт сервис с userId из сессии и отдаёт ответ». Доступ
// без сессии, владение и 400 проверяет e2e (api/test/lesson-notifications.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { MyLessonNotificationsDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import type { UpdateLessonReminderDto } from './dto/update-lesson-reminder.dto';
import type { UpdateLessonScopeDto } from './dto/update-lesson-scope.dto';
import { LessonNotificationsController } from './lesson-notifications.controller';
import { LessonNotificationsService } from './lesson-notifications.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};

const PAGE: MyLessonNotificationsDto = {
  scope: { mode: 'selected', classIds: ['c1'] },
  scopeChosen: true,
  classes: [],
  reminder: { minutes: 30, schoolMinutes: 60 },
};

async function buildController(
  service: Partial<LessonNotificationsService>,
): Promise<LessonNotificationsController> {
  const module = await Test.createTestingModule({
    controllers: [LessonNotificationsController],
    providers: [{ provide: LessonNotificationsService, useValue: service }],
  }).compile();
  return module.get(LessonNotificationsController);
}

describe('LessonNotificationsController', () => {
  it('get() берёт userId из сессии и отдаёт ответ сервиса как есть', async () => {
    const get = jest.fn().mockResolvedValue(PAGE);
    const controller = await buildController({ get });

    await expect(controller.get(USER)).resolves.toEqual(PAGE);
    expect(get).toHaveBeenCalledWith(USER.id);
  });

  it('update() пишет выбор от имени человека из сессии и отдаёт свежее состояние', async () => {
    const update = jest.fn().mockResolvedValue(PAGE);
    const controller = await buildController({ update });
    const body: UpdateLessonScopeDto = { mode: 'selected', classIds: ['c1'] };

    await expect(controller.update(body, USER)).resolves.toEqual(PAGE);
    expect(update).toHaveBeenCalledWith(USER.id, body);
  });

  it('updateReminder() пишет минуты от имени человека из сессии и отдаёт свежее состояние', async () => {
    const updateReminder = jest.fn().mockResolvedValue(PAGE);
    const controller = await buildController({ updateReminder });
    const body: UpdateLessonReminderDto = { minutes: 30 };

    await expect(controller.updateReminder(body, USER)).resolves.toEqual(PAGE);
    expect(updateReminder).toHaveBeenCalledWith(USER.id, body);
  });
});
