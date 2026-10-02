// Test.createTestingModule с фейками сервисов — тот же образец, что
// exam-videos.controller.spec.ts. Роли/CSRF/тело/формат части проверяет e2e
// (answer-videos.e2e-spec.ts/answer-videos-errors.e2e-spec.ts) на настоящем
// гварде и настоящем сыром парсере.
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type {
  AnswerVideoStatsDto,
  AnswerVideoUploadDto,
  ExamMediaDto,
} from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { AnswerVideoCompleteService } from './answer-video-complete';
import { AnswerVideoPartService } from './answer-video-part';
import { AnswerVideoStatsService } from './answer-video-stats.service';
import { AnswerVideosController } from './answer-videos.controller';
import { AnswerVideosService } from './answer-videos.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};

const UPLOAD_DTO: AnswerVideoUploadDto = {
  id: 'v1',
  partBytes: 8 * 1024 * 1024,
  partCount: 1,
  receivedParts: [1],
};

async function buildController(
  overrides: {
    partService?: Partial<AnswerVideoPartService>;
    completeService?: Partial<AnswerVideoCompleteService>;
    service?: Partial<AnswerVideosService>;
    statsService?: Partial<AnswerVideoStatsService>;
  } = {},
): Promise<AnswerVideosController> {
  const module = await Test.createTestingModule({
    controllers: [AnswerVideosController],
    providers: [
      { provide: AnswerVideoPartService, useValue: overrides.partService ?? {} },
      { provide: AnswerVideoCompleteService, useValue: overrides.completeService ?? {} },
      { provide: AnswerVideosService, useValue: overrides.service ?? {} },
      { provide: AnswerVideoStatsService, useValue: overrides.statsService ?? {} },
    ],
  }).compile();
  return module.get(AnswerVideosController);
}

describe('AnswerVideosController', () => {
  // Номер части приходит строкой из пути и приводится здесь, не ParseIntPipe:
  // его английский текст уходил ученику (аудит 2026-10-01, F46); «abc» → NaN,
  // и сервис отвечает своим текстом по VOICE.
  it('uploadPart() передаёт id пользователя, номер части числом и req.body в сервис', async () => {
    const uploadPart = jest.fn().mockResolvedValue(UPLOAD_DTO);
    const controller = await buildController({ partService: { uploadPart } });
    const bytes = Buffer.from([1, 2, 3]);

    await expect(
      controller.uploadPart('v1', '1', { body: bytes }, USER),
    ).resolves.toEqual(UPLOAD_DTO);
    expect(uploadPart).toHaveBeenCalledWith('v1', 'u1', 1, bytes, expect.any(DateTime));

    await controller.uploadPart('v1', 'abc', { body: bytes }, USER);
    expect(uploadPart).toHaveBeenLastCalledWith(
      'v1',
      'u1',
      NaN,
      bytes,
      expect.any(DateTime),
    );
  });

  it('complete() передаёт id пользователя из сессии в сервис', async () => {
    const media: ExamMediaDto = {
      id: 'm1',
      attemptId: 'a1',
      itemId: 'i1',
      kind: 'file',
      answerVideoId: 'v1',
      receivedAt: '2026-09-27T10:00:00.000Z',
    };
    const complete = jest.fn().mockResolvedValue(media);
    const controller = await buildController({ completeService: { complete } });

    await expect(controller.complete('v1', USER)).resolves.toEqual(media);
    expect(complete).toHaveBeenCalledWith('v1', 'u1', expect.any(DateTime));
  });

  it('getStatsSummary() отдаёт то, что вернул сервис статистики', async () => {
    const stats: AnswerVideoStatsDto = { count: 1, totalBytes: 100 };
    const getSummary = jest.fn().mockResolvedValue(stats);
    const controller = await buildController({ statsService: { getSummary } });

    await expect(controller.getStatsSummary()).resolves.toEqual(stats);
    expect(getSummary).toHaveBeenCalledWith();
  });

  it('get() редиректит на подписанную ссылку сервиса, без attachment и с no-store', async () => {
    const signedUrl = jest
      .fn()
      .mockResolvedValue('https://fake-r2.example/answer-videos/v1?X-Amz-Signature=ab');
    const controller = await buildController({ service: { signedUrl } });

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
      'https://fake-r2.example/answer-videos/v1?X-Amz-Signature=ab',
    );
    expect(statusCode).toBe(302);
  });

  it('get() с download=1 просит у сервиса ссылку на скачивание', async () => {
    const signedUrl = jest
      .fn()
      .mockResolvedValue('https://fake-r2.example/answer-videos/v1');
    const controller = await buildController({ service: { signedUrl } });
    const res = { setHeader: () => undefined, status: () => undefined };

    await controller.get('v1', { download: '1' }, USER, res);

    expect(signedUrl).toHaveBeenCalledWith('v1', USER, expect.any(DateTime), {
      download: true,
    });
  });
});
