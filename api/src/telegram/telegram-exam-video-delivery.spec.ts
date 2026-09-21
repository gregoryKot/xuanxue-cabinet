// Юнит без Mongo и без сети (CLAUDE.md «Тесты», ADR-0088): выбор метода Bot
// API по сохранённому типу, перебор для записи со стыка деплоя (без типа) и
// то, что подпись уходит отдельным сообщением только при успешной отправке
// видео. TelegramBotService/UsersService/PersonalChats — фейки поверх той же
// формы, что и реальные классы (CLAUDE.md: чистая логика — без DI).
import { ExamVideoDeliveryRegistry } from '../media/exam-video-delivery.registry';
import type { UserLean, UsersService } from '../users/users.service';
import type { PersonalChats } from './personal-chats';
import { TelegramExamVideoDelivery } from './telegram-exam-video-delivery';
import type { TelegramBotService } from './telegram-bot.service';

const TEACHER: UserLean = {
  id: 'u1',
  name: 'Мария',
  telegramId: 555,
  roles: ['teacher'],
  status: 'active',
};

function fakeUsersService(user: UserLean | null): UsersService {
  return { findById: () => Promise.resolve(user) } as unknown as UsersService;
}

function fakePersonalChats(hasActive: boolean): {
  chats: PersonalChats;
  hasActiveChatFor: jest.Mock;
} {
  const hasActiveChatFor = jest.fn(() => Promise.resolve(hasActive));
  return { chats: { hasActiveChatFor } as unknown as PersonalChats, hasActiveChatFor };
}

interface BotCalls {
  video: { chatId: string; fileId: string; type: string }[];
  message: { chatId: string; text: string }[];
}

/** `results` — `true`/`false` для всех типов разом или карта по типу (перебор). */
function fakeBotService(results: Record<string, boolean> | boolean): {
  bot: TelegramBotService;
  calls: BotCalls;
} {
  const calls: BotCalls = { video: [], message: [] };
  const bot = {
    sendExamVideo: (chatId: string, fileId: string, type: string) => {
      calls.video.push({ chatId, fileId, type });
      const ok = typeof results === 'boolean' ? results : (results[type] ?? false);
      return Promise.resolve(ok);
    },
    sendMessage: (chatId: string, text: string) => {
      calls.message.push({ chatId, text });
      return Promise.resolve(true);
    },
  } as unknown as TelegramBotService;
  return { bot, calls };
}

describe('TelegramExamVideoDelivery', () => {
  it('onModuleInit — кладёт себя в реестр', () => {
    const registry = new ExamVideoDeliveryRegistry();
    const { bot } = fakeBotService(true);
    const delivery = new TelegramExamVideoDelivery(
      bot,
      fakeUsersService(TEACHER),
      fakePersonalChats(true).chats,
      registry,
    );

    delivery.onModuleInit();

    expect(registry.get()).toBe(delivery);
  });

  describe('resolveChatId', () => {
    it('активный личный чат — telegramId строкой', async () => {
      const { bot } = fakeBotService(true);
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(TEACHER),
        fakePersonalChats(true).chats,
        new ExamVideoDeliveryRegistry(),
      );

      await expect(delivery.resolveChatId('u1')).resolves.toBe('555');
    });

    it('нет активного чата — null', async () => {
      const { bot } = fakeBotService(true);
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(TEACHER),
        fakePersonalChats(false).chats,
        new ExamVideoDeliveryRegistry(),
      );

      await expect(delivery.resolveChatId('u1')).resolves.toBeNull();
    });

    it('пользователя нет (или без telegramId) — null, hasActiveChatFor не спрашивается', async () => {
      const { bot } = fakeBotService(true);
      const { chats, hasActiveChatFor } = fakePersonalChats(true);
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(null),
        chats,
        new ExamVideoDeliveryRegistry(),
      );

      await expect(delivery.resolveChatId('u1')).resolves.toBeNull();
      expect(hasActiveChatFor).not.toHaveBeenCalled();
    });
  });

  describe('sendVideo', () => {
    it('сохранённый тип — sendExamVideo звонит один раз этим типом', async () => {
      const { bot, calls } = fakeBotService(true);
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(TEACHER),
        fakePersonalChats(true).chats,
        new ExamVideoDeliveryRegistry(),
      );

      await delivery.sendVideo({
        chatId: '555',
        fileId: 'f1',
        telegramType: 'video_note',
        caption: 'Видео от Пети — экзамен «Форма».',
      });

      expect(calls.video).toEqual([{ chatId: '555', fileId: 'f1', type: 'video_note' }]);
    });

    it('без типа (запись со стыка деплоя) — перебор до первого успеха', async () => {
      const { bot, calls } = fakeBotService({
        video: false,
        video_note: true,
        document: true,
      });
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(TEACHER),
        fakePersonalChats(true).chats,
        new ExamVideoDeliveryRegistry(),
      );

      const ok = await delivery.sendVideo({
        chatId: '555',
        fileId: 'f1',
        caption: 'Подпись',
      });

      expect(ok).toBe(true);
      expect(calls.video.map((c) => c.type)).toEqual(['video', 'video_note']);
    });

    it('все три типа отказали — false, подпись не уходит', async () => {
      const { bot, calls } = fakeBotService(false);
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(TEACHER),
        fakePersonalChats(true).chats,
        new ExamVideoDeliveryRegistry(),
      );

      const ok = await delivery.sendVideo({
        chatId: '555',
        fileId: 'f1',
        caption: 'Подпись',
      });

      expect(ok).toBe(false);
      expect(calls.video.map((c) => c.type)).toEqual(['video', 'video_note', 'document']);
      expect(calls.message).toEqual([]);
    });

    it('видео дошло — подпись уходит отдельным сообщением', async () => {
      const { bot, calls } = fakeBotService(true);
      const delivery = new TelegramExamVideoDelivery(
        bot,
        fakeUsersService(TEACHER),
        fakePersonalChats(true).chats,
        new ExamVideoDeliveryRegistry(),
      );

      await delivery.sendVideo({
        chatId: '555',
        fileId: 'f1',
        telegramType: 'video',
        caption: 'Видео от Пети — экзамен «Форма».',
      });

      expect(calls.message).toEqual([
        { chatId: '555', text: 'Видео от Пети — экзамен «Форма».' },
      ]);
    });
  });
});
