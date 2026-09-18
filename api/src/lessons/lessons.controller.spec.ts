// Test.createTestingModule с фейком сервиса — образец classes.controller.spec.
// Роли/CSRF/404 проверяет e2e (lessons.e2e-spec.ts) на настоящем гварде —
// здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { BroadcastDto, LessonDto, LessonRecordingSummaryDto } from '@xuanxue/shared';
import { SendNowService } from '../broadcasts/send-now.service';
import { LessonRecordingSummaryService } from './lesson-recording-summary.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

const BROADCAST_DTO: BroadcastDto = {
  id: 'b1',
  kind: 'lesson_link',
  status: 'scheduled',
  text: 'x',
  scheduledAt: '2026-09-01T00:00:00.000Z',
  channelIds: ['c1'],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const LESSON_DTO: LessonDto = {
  id: 'l1',
  classId: 'c1',
  startsAt: '2026-09-10T16:00:00.000Z',
  durationMin: 60,
  topic: '',
  status: 'scheduled',
  recordings: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

async function buildController(
  service: Partial<LessonsService> = {},
  sendNowService: Partial<SendNowService> = {},
  recordingSummaryService: Partial<LessonRecordingSummaryService> = {},
): Promise<LessonsController> {
  const module = await Test.createTestingModule({
    controllers: [LessonsController],
    providers: [
      { provide: LessonsService, useValue: service },
      { provide: SendNowService, useValue: sendNowService },
      { provide: LessonRecordingSummaryService, useValue: recordingSummaryService },
    ],
  }).compile();
  return module.get(LessonsController);
}

describe('LessonsController', () => {
  it('list() передаёт query в сервис и возвращает его результат', async () => {
    const list = jest.fn().mockResolvedValue([LESSON_DTO]);
    const controller = await buildController({ list });
    const query = { from: '2026-09-01T00:00:00Z', to: '2026-09-08T00:00:00Z' };

    await expect(controller.list(query)).resolves.toEqual([LESSON_DTO]);
    expect(list).toHaveBeenCalledWith(query);
  });

  it('getById() передаёт id в сервис', async () => {
    const getById = jest.fn().mockResolvedValue(LESSON_DTO);
    const controller = await buildController({ getById });

    await expect(controller.getById('l1')).resolves.toEqual(LESSON_DTO);
    expect(getById).toHaveBeenCalledWith('l1');
  });

  it('create() передаёт тело в сервис', async () => {
    const create = jest.fn().mockResolvedValue(LESSON_DTO);
    const controller = await buildController({ create });
    const body = { classId: 'c1', startsAt: '2026-09-10T16:00:00Z' };

    await expect(controller.create(body)).resolves.toEqual(LESSON_DTO);
    expect(create).toHaveBeenCalledWith(body);
  });

  it('update() передаёт id, тело и now в сервис', async () => {
    const update = jest.fn().mockResolvedValue(LESSON_DTO);
    const controller = await buildController({ update });
    const body = { note: null };

    await expect(controller.update('l1', body)).resolves.toEqual(LESSON_DTO);
    // `now` — DateTime.utc() контроллера, тот же приём, что у addRecording()/
    // sendNow() ниже.
    expect(update).toHaveBeenCalledWith('l1', body, expect.any(DateTime));
  });

  it('remove() передаёт id в сервис', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ remove });

    await controller.remove('l1');
    expect(remove).toHaveBeenCalledWith('l1');
  });

  it('addRecording() передаёт id и тело в сервис', async () => {
    const addRecording = jest.fn().mockResolvedValue(LESSON_DTO);
    const controller = await buildController({ addRecording });
    const body = { url: 'https://drive.example/rec' };

    await expect(controller.addRecording('l1', body)).resolves.toEqual(LESSON_DTO);
    // `now` — DateTime.utc() контроллера, конкретный момент не важен здесь
    // (проверяется в lessons.service.spec.ts/recording-broadcast.service.spec.ts).
    expect(addRecording).toHaveBeenCalledWith('l1', body, expect.any(DateTime));
  });

  it('sendNow() передаёт id в SendNowService', async () => {
    const sendNow = jest.fn().mockResolvedValue(BROADCAST_DTO);
    const controller = await buildController({}, { sendNow });

    await expect(controller.sendNow('l1')).resolves.toEqual(BROADCAST_DTO);
    // `now` — тот же приём, что у addRecording() выше.
    expect(sendNow).toHaveBeenCalledWith('l1', expect.any(DateTime));
  });

  it('getRecordingSummary() зовёт LessonRecordingSummaryService с now', async () => {
    const summary: LessonRecordingSummaryDto = {
      periodDays: 30,
      lessonsPast: 4,
      lessonsWithRecording: 2,
    };
    const get = jest.fn().mockResolvedValue(summary);
    const controller = await buildController({}, {}, { get });

    await expect(controller.getRecordingSummary()).resolves.toEqual(summary);
    expect(get).toHaveBeenCalledWith(expect.any(DateTime));
  });
});
