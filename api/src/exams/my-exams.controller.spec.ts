// Test.createTestingModule с фейком сервиса — образец
// notification-prefs.controller.spec.ts: без HTTP, без Mongo. Владение
// проверяет e2e (my-exams-ownership.e2e-spec.ts) на настоящем гварде — здесь
// только «контроллер зовёт сервис с userId из сессии, не из query».
import { Test } from '@nestjs/testing';
import type { MyExamDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ListMyExamsDto } from './dto/list-my-exams.dto';
import { MyExamsController } from './my-exams.controller';
import { MyExamsService } from './my-exams.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: ['student'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const EXAMS: MyExamDto[] = [
  {
    id: 'exam-1',
    title: 'Экзамен',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
  },
];

async function buildController(
  service: Partial<MyExamsService> = {},
): Promise<MyExamsController> {
  const module = await Test.createTestingModule({
    controllers: [MyExamsController],
    providers: [{ provide: MyExamsService, useValue: service }],
  }).compile();
  return module.get(MyExamsController);
}

describe('MyExamsController', () => {
  it('list() зовёт сервис с userId из сессии, не из query', async () => {
    const list = jest.fn().mockResolvedValue(EXAMS);
    const controller = await buildController({ list });
    const query: ListMyExamsDto = { limit: 5 };

    await expect(controller.list(query, USER)).resolves.toEqual(EXAMS);
    expect(list).toHaveBeenCalledWith(query, USER.id, expect.anything());
  });
});
