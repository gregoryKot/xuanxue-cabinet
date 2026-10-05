// Test.createTestingModule с фейком сервиса — образец my-lessons.controller.spec.ts:
// без HTTP и без Mongo. Что маршрут открыт без сессии и отдаёт ответ без
// Zoom, проверяет e2e на настоящем гварде; здесь — «контроллер зовёт сервис
// с query и временем» и наличие `@Public()` в метаданных: случайно снятый
// декоратор иначе ловил бы только e2e, а юнит-джоба его не запускает.
import { Test } from '@nestjs/testing';
import type { PublicLessonDto } from '@xuanxue/shared';
import { IS_PUBLIC_KEY } from '../auth/auth.decorators';
import type { ListPublicLessonsDto } from './dto/list-public-lessons.dto';
import { PublicLessonsController } from './public-lessons.controller';
import { PublicLessonsService } from './public-lessons.service';

const LESSONS: PublicLessonDto[] = [
  {
    id: 'lesson-1',
    classId: 'class-1',
    startsAt: '2026-10-06T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Тайцзицюань',
    groupLabel: 'группа А',
    format: 'online',
    topic: 'Форма 24',
    status: 'scheduled',
    tags: [],
  },
];

async function buildController(
  service: Partial<PublicLessonsService> = {},
): Promise<PublicLessonsController> {
  const module = await Test.createTestingModule({
    controllers: [PublicLessonsController],
    providers: [{ provide: PublicLessonsService, useValue: service }],
  }).compile();
  return module.get(PublicLessonsController);
}

describe('PublicLessonsController', () => {
  it('list() передаёт query и время в сервис и отдаёт его ответ как есть', async () => {
    const list = jest.fn().mockResolvedValue(LESSONS);
    const controller = await buildController({ list });
    const query: ListPublicLessonsDto = { limit: 5 };

    await expect(controller.list(query)).resolves.toEqual(LESSONS);
    expect(list).toHaveBeenCalledWith(query, expect.anything());
  });

  it('list() помечен @Public(): расписание без Zoom открыто без сессии (ADR-0170)', () => {
    // Метаданные висят на самой функции метода; дескриптор вместо
    // `prototype.list`, чтобы не звать метод отвязанным (unbound-method).
    const handler: unknown = Object.getOwnPropertyDescriptor(
      PublicLessonsController.prototype,
      'list',
    )?.value;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler as object)).toBe(true);
  });
});
