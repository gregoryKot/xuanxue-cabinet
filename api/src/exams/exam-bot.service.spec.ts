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
const VIDEO = { bytes: Buffer.from([1]), contentType: 'video/mp4' as const };

function service(
  overrides: { loadForBot?: jest.Mock; rememberTelegramFileId?: jest.Mock } = {},
): ExamBotService {
  const examVideosService = {
    loadForBot: overrides.loadForBot ?? jest.fn().mockResolvedValue(VIDEO),
    rememberTelegramFileId: overrides.rememberTelegramFileId ?? jest.fn(),
  };
  return new ExamBotService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    examVideosService as never,
    {} as never,
    {} as never,
    new ExamBotPortRegistry(),
  );
}

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
