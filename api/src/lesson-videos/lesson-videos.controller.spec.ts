// Test.createTestingModule с фейком сервисов — тот же образец, что
// exam-videos.controller.spec.ts. Роли, CSRF, тело и доступ проверяет e2e
// (lesson-videos.e2e-spec.ts) на настоящем гварде и настоящем парсере тела.
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { LessonVideoDto, VideoUploadDto } from '@xuanxue/shared';
import { LESSON_VIDEO_LIMITS } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { StartLessonVideoDto } from './dto/start-lesson-video.dto';
import { LessonVideoUploadsService } from './lesson-video-uploads.service';
import { LessonVideosController } from './lesson-videos.controller';
import { LessonVideosService } from './lesson-videos.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
  studentMode: false,
};
const UPLOAD_DTO: VideoUploadDto = {
  id: 'v1',
  partBytes: 8_388_608,
  partCount: 2,
  receivedParts: [1],
};
const VIDEO_DTO: LessonVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 4,
  createdAt: '2026-10-10T10:00:00.000Z',
};

async function buildController(
  uploads: Partial<LessonVideoUploadsService>,
  videos: Partial<LessonVideosService> = {},
): Promise<LessonVideosController> {
  const module = await Test.createTestingModule({
    controllers: [LessonVideosController],
    providers: [
      { provide: LessonVideosService, useValue: videos },
      { provide: LessonVideoUploadsService, useValue: uploads },
    ],
  }).compile();
  return module.get(LessonVideosController);
}

describe('LessonVideosController', () => {
  it('start() передаёт сервису id учителя и тело, ответ — как у сервиса', async () => {
    const start = jest.fn().mockResolvedValue(UPLOAD_DTO);
    const controller = await buildController({ start });

    const dto = await controller.start({ sizeBytes: 10, fingerprint: 'f' }, USER);

    expect(dto).toBe(UPLOAD_DTO);
    expect(start).toHaveBeenCalledWith(
      'u1',
      { sizeBytes: 10, fingerprint: 'f' },
      expect.anything(),
    );
  });

  it('uploadPart() отдаёт сервису сырое тело части и её номер', async () => {
    const uploadPart = jest.fn().mockResolvedValue(UPLOAD_DTO);
    const controller = await buildController({ uploadPart });
    const body = Buffer.from('часть');

    await controller.uploadPart('v1', 2, { body }, USER);

    expect(uploadPart).toHaveBeenCalledWith('v1', 'u1', 2, body, expect.anything());
  });

  it('complete() передаёт кадр из тела', async () => {
    const complete = jest.fn().mockResolvedValue(VIDEO_DTO);
    const controller = await buildController({ complete });

    await expect(controller.complete('v1', { poster: 'abc' }, USER)).resolves.toBe(
      VIDEO_DTO,
    );
    expect(complete).toHaveBeenCalledWith('v1', 'u1', expect.anything(), 'abc');
  });

  it('get() редиректит на подписанную ссылку сервиса с no-store', async () => {
    const signedUrl = jest
      .fn()
      .mockResolvedValue('https://fake-r2.example/lesson-videos/v1');
    const controller = await buildController({}, { signedUrl });
    const headers: Record<string, string> = {};
    let statusCode: number | undefined;
    const res = {
      setHeader: (name: string, value: string) => (headers[name] = value),
      status: (code: number) => (statusCode = code),
    };

    await controller.get('v1', {}, USER, res);

    expect(statusCode).toBe(302);
    expect(headers['Location']).toBe('https://fake-r2.example/lesson-videos/v1');
    expect(headers['Cache-Control']).toBe('no-store');
  });
});

describe('StartLessonVideoDto', () => {
  async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
    const errors = await validate(plainToInstance(StartLessonVideoDto, body));
    return errors.map((error) => error.property);
  }

  it('размер от 1 байта до 2000 МБ и отпечаток-строка — валидно', async () => {
    await expect(errorsFor({ sizeBytes: 1, fingerprint: 'f' })).resolves.toEqual([]);
    await expect(
      errorsFor({ sizeBytes: LESSON_VIDEO_LIMITS.maxBytes, fingerprint: 'f' }),
    ).resolves.toEqual([]);
  });

  it('ноль, больше потолка, не целое и слишком длинный отпечаток — отказ', async () => {
    await expect(errorsFor({ sizeBytes: 0, fingerprint: 'f' })).resolves.toEqual([
      'sizeBytes',
    ]);
    await expect(
      errorsFor({ sizeBytes: LESSON_VIDEO_LIMITS.maxBytes + 1, fingerprint: 'f' }),
    ).resolves.toEqual(['sizeBytes']);
    await expect(errorsFor({ sizeBytes: 1.5, fingerprint: 'f' })).resolves.toEqual([
      'sizeBytes',
    ]);
    await expect(
      errorsFor({ sizeBytes: 1, fingerprint: 'x'.repeat(101) }),
    ).resolves.toEqual(['fingerprint']);
  });
});
