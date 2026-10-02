// Перевод NotFoundError/NotAvailableError в `null` для картинки/видео
// вопроса-варианта бота (ADR-0133 «Уточнено» 2026-09-27) — вынесено вместе с
// кодом из exam-bot.service.spec.ts (exam-bot-media.ts, файл-лимит CLAUDE.md
// «Храповики»); делегирование ExamBotService на эти хелперы проверено там же.
import { DateTime } from 'luxon';
import { NotAvailableError, NotFoundError } from '../common/errors';
import type { ExamImagesService } from '../exam-images/exam-images.service';
import type { ExamVideosService } from '../exam-videos/exam-videos.service';
import type { UserLean } from '../users/users.service';
import { loadOptionImageForBot, loadOptionVideoForBot } from './exam-bot-media';

const NOW = DateTime.utc(2026, 9, 27, 10, 0, 0);
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};
const VIDEO = {
  loadBytes: () => Promise.resolve(Buffer.from([1])),
  contentType: 'video/mp4' as const,
};
const IMAGE = { bytes: Buffer.from([2]), contentType: 'image/png' as const };

function videosService(loadForBot: jest.Mock): ExamVideosService {
  return { loadForBot } as unknown as ExamVideosService;
}

function imagesService(load: jest.Mock): ExamImagesService {
  return { load } as unknown as ExamImagesService;
}

describe('loadOptionImageForBot', () => {
  it('отдаёт картинку как есть', async () => {
    const load = jest.fn().mockResolvedValue(IMAGE);

    await expect(
      loadOptionImageForBot(imagesService(load), 'img-1', USER),
    ).resolves.toEqual(IMAGE);
    expect(load).toHaveBeenCalledWith('img-1', USER);
  });

  it('NotFoundError (чужая картинка/не в снимке попытки) — null, не проброс', async () => {
    const load = jest.fn().mockRejectedValue(new NotFoundError('нет'));

    await expect(
      loadOptionImageForBot(imagesService(load), 'img-1', USER),
    ).resolves.toBeNull();
  });

  it('прочая ошибка (например, Mongo упал) — пробрасывается, не деградация', async () => {
    const load = jest.fn().mockRejectedValue(new Error('mongo упал'));

    await expect(
      loadOptionImageForBot(imagesService(load), 'img-1', USER),
    ).rejects.toThrow('mongo упал');
  });
});

describe('loadOptionVideoForBot', () => {
  it('отдаёт видео как есть', async () => {
    const loadForBot = jest.fn().mockResolvedValue(VIDEO);

    await expect(
      loadOptionVideoForBot(videosService(loadForBot), 'vid-1', USER, NOW),
    ).resolves.toEqual(VIDEO);
    expect(loadForBot).toHaveBeenCalledWith('vid-1', USER, NOW);
  });

  it('NotFoundError (чужое видео/не в снимке попытки) — null, не проброс', async () => {
    const loadForBot = jest.fn().mockRejectedValue(new NotFoundError('нет'));

    await expect(
      loadOptionVideoForBot(videosService(loadForBot), 'vid-1', USER, NOW),
    ).resolves.toBeNull();
  });

  it('NotAvailableError (R2 выключен или объект пропал) — null, не проброс', async () => {
    const loadForBot = jest.fn().mockRejectedValue(new NotAvailableError('выключено'));

    await expect(
      loadOptionVideoForBot(videosService(loadForBot), 'vid-1', USER, NOW),
    ).resolves.toBeNull();
  });

  it('прочая ошибка (например, Mongo упал) — пробрасывается, не деградация', async () => {
    const loadForBot = jest.fn().mockRejectedValue(new Error('mongo упал'));

    await expect(
      loadOptionVideoForBot(videosService(loadForBot), 'vid-1', USER, NOW),
    ).rejects.toThrow('mongo упал');
  });
});
