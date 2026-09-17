// Test.createTestingModule с фейком сервиса (образец
// media/exam-media.controller.spec.ts) — без HTTP и без Mongo. Роли/CSRF/
// тело/формат проверяет e2e (exam-images.e2e-spec.ts) на настоящем гварде и
// настоящем парсере тела.
import { Test } from '@nestjs/testing';
import type { ExamImageDto, ExamImageStatsDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamImageStatsService } from './exam-image-stats.service';
import { ExamImagesController } from './exam-images.controller';
import { ExamImagesService } from './exam-images.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Учитель',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const IMAGE_DTO: ExamImageDto = {
  id: 'i1',
  contentType: 'image/jpeg',
  sizeBytes: 4,
  createdAt: '2026-09-12T10:00:00.000Z',
};

async function buildController(
  service: Partial<ExamImagesService> = {},
  statsService: Partial<ExamImageStatsService> = {},
): Promise<ExamImagesController> {
  const module = await Test.createTestingModule({
    controllers: [ExamImagesController],
    providers: [
      { provide: ExamImagesService, useValue: service },
      { provide: ExamImageStatsService, useValue: statsService },
    ],
  }).compile();
  return module.get(ExamImagesController);
}

describe('ExamImagesController', () => {
  it('upload() передаёт req.body и id пользователя из сессии в сервис', async () => {
    const upload = jest.fn().mockResolvedValue(IMAGE_DTO);
    const controller = await buildController({ upload });
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);

    await expect(controller.upload({ body: bytes }, USER)).resolves.toEqual(IMAGE_DTO);
    expect(upload).toHaveBeenCalledWith(bytes, 'u1');
  });

  it('get() передаёт id и пользователя в сервис, отдаёт StreamableFile с его типом, длиной и кешем на год', async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const load = jest.fn().mockResolvedValue({ bytes, contentType: 'image/png' });
    const controller = await buildController({ load });

    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => (headers[name] = value) };

    const result = await controller.get('i1', USER, res);

    expect(load).toHaveBeenCalledWith('i1', USER);
    expect(result.getHeaders().type).toBe('image/png');
    expect(result.getHeaders().length).toBe(3);
    expect(headers['Cache-Control']).toBe('private, max-age=31536000, immutable');
  });

  it('getStatsSummary() отдаёт то, что вернул сервис статистики', async () => {
    const stats: ExamImageStatsDto = { count: 2, totalBytes: 4000 };
    const getSummary = jest.fn().mockResolvedValue(stats);
    const controller = await buildController({}, { getSummary });

    await expect(controller.getStatsSummary()).resolves.toEqual(stats);
    expect(getSummary).toHaveBeenCalledWith();
  });
});
