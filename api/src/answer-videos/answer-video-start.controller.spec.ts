// Test.createTestingModule с фейком сервиса — тот же образец, что
// answer-videos.controller.spec.ts/exam-videos.controller.spec.ts. Роль/CSRF —
// проверяет e2e (answer-videos.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import type { AnswerVideoUploadDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { AnswerVideoStartController } from './answer-video-start.controller';
import { AnswerVideoStartService } from './answer-video-start';
import { StartAnswerVideoDto } from './dto/start-answer-video.dto';

const USER: UserLean = { id: 'u1', name: 'Ученик', roles: [], status: 'active' };

const UPLOAD_DTO: AnswerVideoUploadDto = {
  id: 'v1',
  partBytes: 8 * 1024 * 1024,
  partCount: 1,
  receivedParts: [],
};

async function buildController(
  service: Partial<AnswerVideoStartService> = {},
): Promise<AnswerVideoStartController> {
  const module = await Test.createTestingModule({
    controllers: [AnswerVideoStartController],
    providers: [{ provide: AnswerVideoStartService, useValue: service }],
  }).compile();
  return module.get(AnswerVideoStartController);
}

describe('AnswerVideoStartController', () => {
  it('start() передаёт тело и id пользователя из сессии в сервис', async () => {
    const start = jest.fn().mockResolvedValue(UPLOAD_DTO);
    const controller = await buildController({ start });
    const body: StartAnswerVideoDto = {
      itemId: '507f1f77bcf86cd799439011',
      sizeBytes: 100,
      fingerprint: '100:1',
    };

    await expect(controller.start('a1', body, USER)).resolves.toEqual(UPLOAD_DTO);
    expect(start).toHaveBeenCalledWith('a1', 'u1', body, expect.any(DateTime));
  });
});
