// Test.createTestingModule с фейками сервисов — образец
// notification-prefs.controller.spec.ts: без HTTP, без Mongo. Доступ у
// гостя/ученика проверяет e2e (my-lessons.e2e-spec.ts,
// my-lessons-archive.e2e-spec.ts) на настоящем гварде — здесь только
// «контроллер зовёт сервис с query и отдаёт ответ».
import { Test } from '@nestjs/testing';
import type { MyArchivedLessonDto, MyLessonDto } from '@xuanxue/shared';
import { ListMyArchivedLessonsDto } from './dto/list-my-archived-lessons.dto';
import { ListMyLessonsDto } from './dto/list-my-lessons.dto';
import { MyLessonsArchiveService } from './my-lessons-archive.service';
import { MyLessonsController } from './my-lessons.controller';
import { MyLessonsService } from './my-lessons.service';

const LESSONS: MyLessonDto[] = [
  {
    id: 'lesson-1',
    startsAt: '2026-09-15T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Тайцзицюань',
    groupLabel: 'группа А',
    format: 'online',
    topic: 'Форма 24',
    status: 'scheduled',
    tags: [],
  },
];

const ARCHIVED_LESSONS: MyArchivedLessonDto[] = [
  {
    id: 'lesson-0',
    startsAt: '2026-09-01T16:00:00.000Z',
    classTitle: 'Тайцзицюань',
    groupLabel: 'группа А',
    topic: 'Форма 8',
    status: 'scheduled',
    recordings: [],
    tags: [],
  },
];

async function buildController(
  service: Partial<MyLessonsService> = {},
  archiveService: Partial<MyLessonsArchiveService> = {},
): Promise<MyLessonsController> {
  const module = await Test.createTestingModule({
    controllers: [MyLessonsController],
    providers: [
      { provide: MyLessonsService, useValue: service },
      { provide: MyLessonsArchiveService, useValue: archiveService },
    ],
  }).compile();
  return module.get(MyLessonsController);
}

describe('MyLessonsController', () => {
  it('list() передаёт query в сервис и отдаёт его ответ как есть', async () => {
    const list = jest.fn().mockResolvedValue(LESSONS);
    const controller = await buildController({ list });
    const query: ListMyLessonsDto = { limit: 5 };

    await expect(controller.list(query)).resolves.toEqual(LESSONS);
    expect(list).toHaveBeenCalledWith(query, expect.anything());
  });

  it('listArchive() передаёт query в архивный сервис и отдаёт его ответ как есть', async () => {
    const list = jest.fn().mockResolvedValue(ARCHIVED_LESSONS);
    const controller = await buildController({}, { list });
    const query: ListMyArchivedLessonsDto = { limit: 5 };

    await expect(controller.listArchive(query)).resolves.toEqual(ARCHIVED_LESSONS);
    expect(list).toHaveBeenCalledWith(query, expect.anything());
  });
});
