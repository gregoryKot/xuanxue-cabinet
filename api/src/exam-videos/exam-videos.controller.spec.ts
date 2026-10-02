// Test.createTestingModule с фейком сервиса — тот же образец, что
// exam-images.controller.spec.ts. Роли/CSRF/тело/формат проверяет e2e
// (exam-videos.e2e-spec.ts) на настоящем гварде и настоящем парсере тела.
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { ExamVideoDto, ExamVideoStatsDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideosController } from './exam-videos.controller';
import { ExamVideosService } from './exam-videos.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
  studentMode: false,
};

const VIDEO_DTO: ExamVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 4,
  createdAt: '2026-09-23T10:00:00.000Z',
};

async function buildController(
  service: Partial<ExamVideosService> = {},
  statsService: Partial<ExamVideoStatsService> = {},
): Promise<ExamVideosController> {
  const module = await Test.createTestingModule({
    controllers: [ExamVideosController],
    providers: [
      { provide: ExamVideosService, useValue: service },
      { provide: ExamVideoStatsService, useValue: statsService },
    ],
  }).compile();
  return module.get(ExamVideosController);
}

describe('ExamVideosController', () => {
  it('upload() передаёт req.body и id пользователя из сессии в сервис', async () => {
    const upload = jest.fn().mockResolvedValue(VIDEO_DTO);
    const controller = await buildController({ upload });
    const bytes = Buffer.from([0, 0, 0, 0x20]);

    await expect(controller.upload({ body: bytes }, USER)).resolves.toEqual(VIDEO_DTO);
    expect(upload).toHaveBeenCalledWith(bytes, 'u1', expect.any(DateTime));
  });

  it('get() редиректит на подписанную ссылку сервиса, без attachment и с no-store', async () => {
    const signedUrl = jest
      .fn()
      .mockResolvedValue('https://fake-r2.example/exam-videos/v1?X-Amz-Signature=ab');
    const controller = await buildController({ signedUrl });

    const headers: Record<string, string> = {};
    let statusCode: number | undefined;
    const res = {
      setHeader: (name: string, value: string) => (headers[name] = value),
      status: (code: number) => {
        statusCode = code;
      },
    };

    await controller.get('v1', {}, USER, res);

    expect(signedUrl).toHaveBeenCalledWith('v1', USER, expect.any(DateTime), {
      download: false,
    });
    expect(headers['Cache-Control']).toBe('no-store');
    expect(headers['Location']).toBe(
      'https://fake-r2.example/exam-videos/v1?X-Amz-Signature=ab',
    );
    expect(statusCode).toBe(302);
  });

  it('getStatsSummary() отдаёт то, что вернул сервис статистики', async () => {
    const stats: ExamVideoStatsDto = { count: 2, totalBytes: 4000 };
    const getSummary = jest.fn().mockResolvedValue(stats);
    const controller = await buildController({}, { getSummary });

    await expect(controller.getStatsSummary()).resolves.toEqual(stats);
    expect(getSummary).toHaveBeenCalledWith();
  });

  it('get() с download=1 просит у сервиса ссылку на скачивание', async () => {
    const signedUrl = jest
      .fn()
      .mockResolvedValue('https://fake-r2.example/exam-videos/v1');
    const controller = await buildController({ signedUrl });
    const res = { setHeader: () => undefined, status: () => undefined };

    await controller.get('v1', { download: '1' }, USER, res);

    expect(signedUrl).toHaveBeenCalledWith('v1', USER, expect.any(DateTime), {
      download: true,
    });
  });
});
