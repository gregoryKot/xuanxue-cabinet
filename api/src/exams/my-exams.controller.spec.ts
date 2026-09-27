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
  roles: [],
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

  // ADR-0129: markSeen() отдаёт список целиком (ответ list()), не 204 —
  // клиент кладёт его на экран без второго GET (ADR-0087).
  it('markSeen() зовёт сервис с userId из сессии и examId из пути, отдаёт свежий список', async () => {
    const markSeen = jest.fn().mockResolvedValue(undefined);
    const list = jest.fn().mockResolvedValue(EXAMS);
    const controller = await buildController({ markSeen, list });

    await expect(controller.markSeen('exam-1', USER)).resolves.toEqual(EXAMS);
    expect(markSeen).toHaveBeenCalledWith('exam-1', USER.id);
    expect(list).toHaveBeenCalledWith({}, USER.id, expect.anything());
  });
});
