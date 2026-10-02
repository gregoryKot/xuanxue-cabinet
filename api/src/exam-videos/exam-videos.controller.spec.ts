// Test.createTestingModule с фейком сервиса — тот же образец, что
// exam-images.controller.spec.ts. Роли/CSRF/тело/формат проверяет e2e
// (exam-videos.e2e-spec.ts) на настоящем гварде и настоящем парсере тела.
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { ExamVideoDto, ExamVideoStatsDto, VideoUploadDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideoUploadsService } from './exam-video-uploads.service';
import { ExamVideosController } from './exam-videos.controller';
import { ExamVideosService } from './exam-videos.service';

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

const VIDEO_DTO: ExamVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 4,
  createdAt: '2026-09-23T10:00:00.000Z',
};

async function buildController(
  service: Partial<ExamVideosService> = {},
  statsService: Partial<ExamVideoStatsService> = {},
  uploadsService: Partial<ExamVideoUploadsService> = {},
): Promise<ExamVideosController> {
  const module = await Test.createTestingModule({
    controllers: [ExamVideosController],
    providers: [
      { provide: ExamVideosService, useValue: service },
      { provide: ExamVideoStatsService, useValue: statsService },
      { provide: ExamVideoUploadsService, useValue: uploadsService },
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

  // ADR-0165: загрузка частями — контроллер только передаёт id пользователя из
  // сессии (владение проверяет сервис), без своей логики.
  it('start() передаёт id пользователя и тело старта в сервис загрузки', async () => {
    const start = jest.fn().mockResolvedValue(UPLOAD_DTO);
    const controller = await buildController({}, {}, { start });
    const body = { sizeBytes: 9_000_000, fingerprint: '9000000:abc' };

    await expect(controller.start(body, USER)).resolves.toEqual(UPLOAD_DTO);
    expect(start).toHaveBeenCalledWith('u1', body, expect.any(DateTime));
  });

  it('uploadPart() передаёт id загрузки, номер, тело части и пользователя', async () => {
    const uploadPart = jest.fn().mockResolvedValue(UPLOAD_DTO);
    const controller = await buildController({}, {}, { uploadPart });
    const bytes = Buffer.from([1, 2, 3]);

    await expect(controller.uploadPart('v1', 2, { body: bytes }, USER)).resolves.toEqual(
      UPLOAD_DTO,
    );
    expect(uploadPart).toHaveBeenCalledWith('v1', 'u1', 2, bytes, expect.any(DateTime));
  });

  it('complete() отдаёт то, что вернул сервис загрузки', async () => {
    const complete = jest.fn().mockResolvedValue(VIDEO_DTO);
    const controller = await buildController({}, {}, { complete });

    await expect(controller.complete('v1', USER)).resolves.toEqual(VIDEO_DTO);
    expect(complete).toHaveBeenCalledWith('v1', 'u1', expect.any(DateTime));
  });
});
