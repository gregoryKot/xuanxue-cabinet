// Юнит-тест без Mongo и без DI (CLAUDE.md «Тесты») — остальные методы
// ExamBotService уже покрыты интеграционными спеками бота
// (exam-attempt-flow.spec.ts и соседи, поверх настоящих сервисов); видео
// (2026-09-27, «Уточнено» ADR-0133) не проходит через них ни разу — тот же
// разрыв, что закрыла бы такая же интеграция, но точечный юнит-тест дешевле.
// Перевод NotFoundError/NotAvailableError в `null` живёт в exam-bot-media.ts
// (файл-лимит CLAUDE.md «Храповики») и проверен там же (exam-bot-media.spec.ts) —
// здесь только то, что сервис зовёт ExamVideosService через этот хелпер и
// отдаёт результат наружу как есть.
import { DateTime } from 'luxon';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { ExamBotPortRegistry } from '../telegram/exam-bot-port.registry';
import type { UserLean } from '../users/users.service';
import { ExamBotService } from './exam-bot.service';

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

const ATTEMPT = {
  id: 'a1',
  status: 'in_progress',
  answers: [],
} as unknown as ExamAttemptDto;

function service(
  overrides: {
    loadForBot?: jest.Mock;
    rememberTelegramFileId?: jest.Mock;
    attempts?: Partial<Record<'getOwn' | 'list' | 'saveAnswers', jest.Mock>>;
  } = {},
): ExamBotService {
  const examVideosService = {
    loadForBot: overrides.loadForBot ?? jest.fn().mockResolvedValue(VIDEO),
    rememberTelegramFileId: overrides.rememberTelegramFileId ?? jest.fn(),
  };
  const mediaAssetsService = { listForAttempt: jest.fn().mockResolvedValue([]) };
  return new ExamBotService(
    {} as never,
    (overrides.attempts ?? {}) as never,
    {} as never,
    mediaAssetsService as never,
    {} as never,
    examVideosService as never,
    {} as never,
    {} as never,
    new ExamBotPortRegistry(),
  );
}

// Аудит 2026-10-01 (F26): до фикса метод шёл list(limit 200) и искал по id.
describe('ExamBotService.loadOwnAttempt', () => {
  it('зовёт getOwn по владельцу, не list, и подмешивает media', async () => {
    const getOwn = jest.fn().mockResolvedValue(ATTEMPT);
    const list = jest.fn();
    const bot = service({ attempts: { getOwn, list } });

    await expect(bot.loadOwnAttempt('a1', USER, NOW)).resolves.toEqual({
      ...ATTEMPT,
      media: [],
    });
    expect(getOwn).toHaveBeenCalledWith('a1', USER.id, NOW);
    expect(list).not.toHaveBeenCalled();
  });

  it('NotFoundError (чужой/битый id) — null, прочая ошибка — наружу', async () => {
    const notFound = service({
      attempts: { getOwn: jest.fn().mockRejectedValue(new NotFoundError('нет')) },
    });
    await expect(notFound.loadOwnAttempt('a1', USER, NOW)).resolves.toBeNull();

    const broken = service({
      attempts: { getOwn: jest.fn().mockRejectedValue(new Error('mongo упал')) },
    });
    await expect(broken.loadOwnAttempt('a1', USER, NOW)).rejects.toThrow('mongo упал');
  });
});

// Аудит 2026-10-01 (F27): переключение — внутри CAS сервиса, не по снимку бота.
describe('ExamBotService.toggleOption', () => {
  it('передаёт toggleOption в saveAnswers по владельцу и подмешивает media', async () => {
    const saveAnswers = jest.fn().mockResolvedValue(ATTEMPT);
    const bot = service({ attempts: { saveAnswers } });

    await expect(
      bot.toggleOption('a1', USER, { itemId: 'i1', optionId: 'o1' }, NOW),
    ).resolves.toEqual({ ...ATTEMPT, media: [] });
    expect(saveAnswers).toHaveBeenCalledWith(
      'a1',
      USER.id,
      { toggleOption: { itemId: 'i1', optionId: 'o1' } },
      NOW,
    );
  });
});

describe('ExamBotService.loadOptionVideo', () => {
  it('делегирует ExamVideosService.loadForBot и отдаёт результат как есть', async () => {
    const loadForBot = jest.fn().mockResolvedValue(VIDEO);
    const bot = service({ loadForBot });

    await expect(bot.loadOptionVideo('vid-1', USER, NOW)).resolves.toEqual(VIDEO);
    expect(loadForBot).toHaveBeenCalledWith('vid-1', USER, NOW);
  });
});

describe('ExamBotService.rememberVideoFileId', () => {
  it('делегирует ExamVideosService.rememberTelegramFileId', async () => {
    const rememberTelegramFileId = jest.fn().mockResolvedValue(undefined);
    const bot = service({ rememberTelegramFileId });

    await bot.rememberVideoFileId('vid-1', 'tg-file-1');

    expect(rememberTelegramFileId).toHaveBeenCalledWith('vid-1', 'tg-file-1');
  });
});
