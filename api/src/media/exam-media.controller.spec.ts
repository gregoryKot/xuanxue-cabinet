// Test.createTestingModule с фейком сервиса — образец
// exam-attempts.controller.spec.ts: без HTTP, без Mongo. Роли/CSRF/404/
// владение проверяет e2e (exam-media.e2e-spec.ts) на настоящем гварде —
// здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import type { ExamMediaDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamMediaController } from './exam-media.controller';
import { MediaAssetsService } from './media-assets.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const MEDIA_DTO: ExamMediaDto = {
  id: 'm1',
  attemptId: 'a1',
  kind: 'link',
  url: 'https://vk.com/video-1',
  receivedAt: '2026-09-12T10:00:00.000Z',
};

async function buildController(
  service: Partial<MediaAssetsService> = {},
): Promise<ExamMediaController> {
  const module = await Test.createTestingModule({
    controllers: [ExamMediaController],
    providers: [{ provide: MediaAssetsService, useValue: service }],
  }).compile();
  return module.get(ExamMediaController);
}

describe('ExamMediaController', () => {
  it('addLink() передаёт id попытки, id пользователя из сессии и url в сервис', async () => {
    const addLink = jest.fn().mockResolvedValue(MEDIA_DTO);
    const controller = await buildController({ addLink });

    await expect(
      controller.addLink('a1', { url: 'https://vk.com/video-1' }, USER),
    ).resolves.toEqual(MEDIA_DTO);
    expect(addLink).toHaveBeenCalledWith(
      'a1',
      'u1',
      'https://vk.com/video-1',
      expect.anything(),
      undefined,
    );
  });

  it('addLink() с itemId — передаёт его дальше в сервис (ADR-0037)', async () => {
    const addLink = jest.fn().mockResolvedValue(MEDIA_DTO);
    const controller = await buildController({ addLink });
    const itemId = '507f1f77bcf86cd799439099';

    await controller.addLink('a1', { url: 'https://vk.com/video-1', itemId }, USER);

    expect(addLink).toHaveBeenCalledWith(
      'a1',
      'u1',
      'https://vk.com/video-1',
      expect.anything(),
      itemId,
    );
  });

  it('addManual() передаёт id попытки и note в сервис, не проверяет владение сам', async () => {
    const manualDto: ExamMediaDto = {
      ...MEDIA_DTO,
      kind: 'manual',
      url: undefined,
      note: 'т',
    };
    const addManual = jest.fn().mockResolvedValue(manualDto);
    const controller = await buildController({ addManual });

    await expect(controller.addManual('a1', { note: 'т' })).resolves.toEqual(manualDto);
    expect(addManual).toHaveBeenCalledWith('a1', 'т', expect.anything(), undefined);
  });

  it('addManual() без note — передаёт undefined, не пустую строку', async () => {
    const addManual = jest.fn().mockResolvedValue(MEDIA_DTO);
    const controller = await buildController({ addManual });

    await controller.addManual('a1', {});

    expect(addManual).toHaveBeenCalledWith('a1', undefined, expect.anything(), undefined);
  });

  it('addManual() с itemId — передаёт его дальше в сервис (ADR-0037)', async () => {
    const addManual = jest.fn().mockResolvedValue(MEDIA_DTO);
    const controller = await buildController({ addManual });
    const itemId = '507f1f77bcf86cd799439099';

    await controller.addManual('a1', { note: 'т', itemId });

    expect(addManual).toHaveBeenCalledWith('a1', 'т', expect.anything(), itemId);
  });

  // ADR-0088: кнопка «Прислать мне в бота» — чат берётся из сессии
  // (SECURITY §3), поэтому userId в вызов сервиса, не тело запроса.
  it('sendToMe() передаёт id попытки, id записи и id пользователя из сессии', async () => {
    const sendToChat = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({ sendToChat });

    await expect(controller.sendToMe('a1', 'm1', USER)).resolves.toBeUndefined();
    expect(sendToChat).toHaveBeenCalledWith('a1', 'm1', 'u1');
  });
});
