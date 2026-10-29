// Test.createTestingModule с фейком сервиса — тот же образец, что
// exam-videos.controller.spec.ts. Роли и разбор тела проверяет e2e
// (api/test/exam-videos-transcode.e2e-spec.ts) на настоящем гварде и ValidationPipe.
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { ExamVideoDto } from '@xuanxue/shared';
import { ExamVideoTranscodeController } from './exam-video-transcode.controller';
import { ExamVideoTranscodeService } from './exam-video-transcode.service';

const VIDEO_DTO: ExamVideoDto = {
  id: 'v1',
  contentType: 'video/mp4',
  sizeBytes: 4,
  createdAt: '2026-10-29T10:00:00.000Z',
};

async function buildController(
  service: Partial<ExamVideoTranscodeService>,
): Promise<ExamVideoTranscodeController> {
  const module = await Test.createTestingModule({
    controllers: [ExamVideoTranscodeController],
    providers: [{ provide: ExamVideoTranscodeService, useValue: service }],
  }).compile();
  return module.get(ExamVideoTranscodeController);
}

describe('ExamVideoTranscodeController', () => {
  it('listPending() отдаёт список сервиса', async () => {
    const listPending = jest.fn().mockResolvedValue([VIDEO_DTO]);
    const controller = await buildController({ listPending });

    await expect(controller.listPending()).resolves.toEqual([VIDEO_DTO]);
    expect(listPending).toHaveBeenCalledWith();
  });

  it('setCodec() передаёт id из пути и кодек из тела', async () => {
    const setCodec = jest.fn().mockResolvedValue(VIDEO_DTO);
    const controller = await buildController({ setCodec });

    await expect(controller.setCodec('v1', { codec: 'hevc' })).resolves.toEqual(
      VIDEO_DTO,
    );
    expect(setCodec).toHaveBeenCalledWith('v1', 'hevc');
  });

  it('replace() передаёт id цели, id замены и текущее время', async () => {
    const replace = jest.fn().mockResolvedValue(VIDEO_DTO);
    const controller = await buildController({ replace });

    await expect(controller.replace('v1', { replacementId: 'v2' })).resolves.toEqual(
      VIDEO_DTO,
    );
    expect(replace).toHaveBeenCalledWith('v1', 'v2', expect.any(DateTime));
  });
});
