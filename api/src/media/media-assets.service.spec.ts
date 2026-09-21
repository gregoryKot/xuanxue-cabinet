// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): привязка видео к своей попытке, чужой attemptId — ничего не
// привязано (SECURITY §3, ADR-0023), ссылка (валидная/дубль), ручная
// отметка, выборка по попытке/списку попыток.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptRecord } from '../utils/encryption';
import {
  EXAM_ATTEMPT_ENCRYPT_SCHEMA,
  ExamAttemptRecord,
  ExamAttemptSchema,
  type AttemptBlockRecord,
} from '../exams/exam-attempt.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import type { ExamVideoDeliveryPort } from './exam-video-delivery.port';
import { ExamVideoDeliveryRegistry } from './exam-video-delivery.registry';
import { MediaAssetRecord, MediaAssetSchema } from './media-asset.schema';
import { MediaAssetsService } from './media-assets.service';
import type { VideoLinkAddedContext } from './exam-media-notifier.port';
import { ExamMediaNotifierRegistry } from './exam-media-notifier.registry';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

// Похожи на настоящие file_id Telegram и заведомо не встречаются в hex
// ObjectId: короткое «f1» однажды нашлось внутри случайного id, и тест
// про «fileId не уходит наружу» покраснел на ровном месте.
const PLAIN_EXAM_TITLE = 'Форма без шифрования';
const FILE_ID = 'BgADBAADrwAD-video-file-id';
const FILE_UNIQUE_ID = 'AgADrwAD-unique-id';

// Снимок с одним video-вопросом и одним text — используется тестами itemId
// (ADR-0037): video-вопрос проходит проверку isVideoItemInSnapshot, text —
// нет, случайный id — тоже нет (его в снимке вообще нет).
const VIDEO_ITEM_ID = new Types.ObjectId().toString();
const OTHER_VIDEO_ITEM_ID = new Types.ObjectId().toString();
const TEXT_ITEM_ID = new Types.ObjectId().toString();
const BLOCKS_WITH_VIDEO: AttemptBlockRecord[] = [
  {
    id: 'b1',
    title: 'Блок',
    questions: [
      {
        itemId: VIDEO_ITEM_ID,
        version: 1,
        kind: 'video',
        prompt: 'Снимите форму',
        options: [],
      },
      {
        itemId: OTHER_VIDEO_ITEM_ID,
        version: 1,
        kind: 'video',
        prompt: 'И ещё одну',
        options: [],
      },
      {
        itemId: TEXT_ITEM_ID,
        version: 1,
        kind: 'text',
        prompt: 'Опишите форму',
        options: [],
      },
    ],
  },
];

describe('MediaAssetsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let attemptModel: Model<ExamAttemptRecord>;
  let mediaModel: Model<MediaAssetRecord>;
  let userModel: Model<UserRecord>;
  let deliveryRegistry: ExamVideoDeliveryRegistry;
  let service: MediaAssetsService;
  let notifierRegistry: ExamMediaNotifierRegistry;
  let notifyVideoLinkAdded: jest.Mock<Promise<void>, [VideoLinkAddedContext, DateTime]>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    mediaModel = connection.model<MediaAssetRecord>(
      MediaAssetRecord.name,
      MediaAssetSchema,
    );
    await mediaModel.syncIndexes();
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    deliveryRegistry = new ExamVideoDeliveryRegistry();
    notifierRegistry = new ExamMediaNotifierRegistry();
    service = new MediaAssetsService(
      mediaModel,
      attemptModel,
      new UsersService(userModel),
      notifierRegistry,
      deliveryRegistry,
    );
  }, 60_000);

  // Фейковый ExamMediaNotifier — тестируется здесь только сам факт и
  // контекст вызова (ADR-0084); поведение каждого плеча — дело
  // telegram-exam-notifier.spec.ts/in-app-exam-notifier.spec.ts.
  beforeEach(() => {
    notifyVideoLinkAdded = jest
      .fn<Promise<void>, [VideoLinkAddedContext, DateTime]>()
      .mockResolvedValue(undefined);
    notifierRegistry.set({ notifyVideoLinkAdded });
  });

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await attemptModel.deleteMany({});
    await mediaModel.deleteMany({});
  });

  async function seedAttempt(
    userId: string,
    options: {
      examTitle?: string;
      plainTitle?: boolean;
      blocks?: AttemptBlockRecord[];
    } = {},
  ) {
    const examTitle = options.examTitle ?? 'Форма первого уровня';
    // `Record<string, unknown>` — тот же приём, что createAttempt
    // (exams/exam-attempt-start.ts): blocks здесь настоящий массив до
    // encryptRecord/JSON.stringify, схема Mongoose ждёт уже строку.
    const record: Record<string, unknown> = {
      examId: new Types.ObjectId(),
      examTitle,
      userId: new Types.ObjectId(userId),
      attemptNo: 1,
      status: 'in_progress' as const,
      blocks: options.blocks ?? [],
      answers: '[]',
      startedAt: NOW.toJSDate(),
    };
    // `plainTitle` — документ, записанный до шифрования названия (или при
    // другом ключе): сервис обязан показать строку как есть, а не пустоту.
    // `blocks` в этой ветке — тоже как есть, поэтому строкой (иначе Mongoose
    // приведёт массив к String через `[].toString()`, не JSON).
    const created = await attemptModel.create(
      options.plainTitle
        ? { ...record, blocks: JSON.stringify(options.blocks ?? []) }
        : encryptRecord(record, EXAM_ATTEMPT_ENCRYPT_SCHEMA),
    );
    return created._id.toString();
  }

  const USER_A = new Types.ObjectId().toString();
  const USER_B = new Types.ObjectId().toString();

  describe('attachTelegramVideo', () => {
    it('владелец попытки — видео привязывается, examTitle расшифрован', async () => {
      const attemptId = await seedAttempt(USER_A);

      const result = await service.attachTelegramVideo(
        attemptId,
        USER_A,
        {
          fileId: FILE_ID,
          fileUniqueId: FILE_UNIQUE_ID,
          durationSec: 12,
          sizeBytes: 1024,
        },
        NOW,
      );

      expect(result?.examTitle).toBe('Форма первого уровня');
      expect(result?.media.kind).toBe('telegram');
      expect(result?.media.durationSec).toBe(12);
      // fileId/fileUniqueId никогда не покидают сервис в DTO.
      expect(JSON.stringify(result?.media)).not.toContain(FILE_ID);

      const raw = await mediaModel
        .findOne({ attemptId: new Types.ObjectId(attemptId) })
        .lean();
      expect(raw?.fileId).not.toBe(FILE_ID); // зашифровано в базе
    });

    it('чужой attemptId — ничего не привязано, без уточнения причины', async () => {
      const attemptId = await seedAttempt(USER_A);

      const result = await service.attachTelegramVideo(
        attemptId,
        USER_B,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(result).toBeNull();
      await expect(mediaModel.countDocuments({})).resolves.toBe(0);
    });

    // Старая попытка могла быть записана до шифрования названия (или
    // ключ сменили): decrypt возвращает null, и тогда берём строку как есть,
    // а не показываем пустоту (та же защита, что у остальных мапперов).
    it('examTitle лежит незашифрованным — берётся как есть', async () => {
      const attemptId = await seedAttempt(USER_A, {
        examTitle: PLAIN_EXAM_TITLE,
        plainTitle: true,
      });

      const attached = await service.attachTelegramVideo(
        attemptId,
        USER_A,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(attached?.examTitle).toBe(PLAIN_EXAM_TITLE);
    });

    it('несуществующий attemptId — null, не падает', async () => {
      const result = await service.attachTelegramVideo(
        new Types.ObjectId().toString(),
        USER_A,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(result).toBeNull();
    });

    it('нет привязанного пользователя (userId не пришёл) — null', async () => {
      const attemptId = await seedAttempt(USER_A);

      const result = await service.attachTelegramVideo(
        attemptId,
        undefined,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(result).toBeNull();
    });

    it('два видео от одного отправителя (кружок + обычное) — оба привязаны', async () => {
      const attemptId = await seedAttempt(USER_A);

      await service.attachTelegramVideo(
        attemptId,
        USER_A,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );
      await service.attachTelegramVideo(
        attemptId,
        USER_A,
        { fileId: 'BgAAOTHER-file-id', fileUniqueId: 'AgADOTHER-unique' },
        NOW,
      );

      const list = await service.listForAttempt(attemptId);
      expect(list).toHaveLength(2);
    });

    // ADR-0037: itemId, если передан, обязан быть video-вопросом снимка —
    // причина не объясняется (SECURITY §3), путь бота не разговорчив.
    describe('itemId (ADR-0037)', () => {
      it('video-вопрос снимка — привязывается с itemId', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        const result = await service.attachTelegramVideo(
          attemptId,
          USER_A,
          { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
          NOW,
          VIDEO_ITEM_ID,
        );

        expect(result?.media.itemId).toBe(VIDEO_ITEM_ID);
      });

      it('itemId не из снимка — null, ничего не сохранено', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        const result = await service.attachTelegramVideo(
          attemptId,
          USER_A,
          { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
          NOW,
          new Types.ObjectId().toString(),
        );

        expect(result).toBeNull();
        await expect(mediaModel.countDocuments({})).resolves.toBe(0);
      });

      it('itemId вопроса не video (text) — null', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        const result = await service.attachTelegramVideo(
          attemptId,
          USER_A,
          { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
          NOW,
          TEXT_ITEM_ID,
        );

        expect(result).toBeNull();
      });
    });
  });

  describe('addLink', () => {
    it('владелец — ссылка сохраняется', async () => {
      const attemptId = await seedAttempt(USER_A);

      const dto = await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);

      expect(dto.kind).toBe('link');
      expect(dto.url).toBe('https://vk.com/video-1');
    });

    it('чужая попытка — NotFoundError, не Forbidden (не подтверждаем существование)', async () => {
      const attemptId = await seedAttempt(USER_A);

      await expect(
        service.addLink(attemptId, USER_B, 'https://vk.com/video-1', NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('несуществующая попытка — NotFoundError', async () => {
      await expect(
        service.addLink(
          new Types.ObjectId().toString(),
          USER_A,
          'https://vk.com/video-1',
          NOW,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    // ADR-0086: повторная ссылка на тот же вопрос заменяет прежнюю запись, а
    // не создаёт вторую и не падает на уникальном индексе.
    it('вторая ссылка на ту же попытку — заменяет первую, документ один', async () => {
      const attemptId = await seedAttempt(USER_A);
      const first = await service.addLink(
        attemptId,
        USER_A,
        'https://vk.com/video-1',
        NOW,
      );

      const second = await service.addLink(
        attemptId,
        USER_A,
        'https://vk.com/video-2',
        NOW.plus({ minutes: 1 }),
      );

      expect(second.id).toBe(first.id);
      expect(second.url).toBe('https://vk.com/video-2');
      const list = await service.listForAttempt(attemptId);
      expect(list).toHaveLength(1);
      expect(list[0]?.url).toBe('https://vk.com/video-2');
      await expect(
        mediaModel.countDocuments({ attemptId: new Types.ObjectId(attemptId) }),
      ).resolves.toBe(1);
    });

    it('попытка graded — ConflictError, прежняя ссылка не менялась', async () => {
      const attemptId = await seedAttempt(USER_A);
      await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);
      await attemptModel.updateOne(
        { _id: new Types.ObjectId(attemptId) },
        { $set: { status: 'graded' } },
      );

      await expect(
        service.addLink(attemptId, USER_A, 'https://vk.com/video-2', NOW),
      ).rejects.toBeInstanceOf(ConflictError);

      const list = await service.listForAttempt(attemptId);
      expect(list).toHaveLength(1);
      expect(list[0]?.url).toBe('https://vk.com/video-1');
    });

    it('сбой записи не по дублю (не E11000) — уходит наверх как есть, не ConflictError', async () => {
      const attemptId = await seedAttempt(USER_A);
      const dbError = new Error('connection lost');
      jest.spyOn(mediaModel, 'findOneAndUpdate').mockReturnValueOnce({
        lean: () => Promise.reject(dbError),
      } as never);

      await expect(
        service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW),
      ).rejects.toBe(dbError);
    });

    // ADR-0037: itemId различает ссылки на РАЗНЫЕ вопросы одной попытки —
    // уникальный индекс теперь (attemptId, itemId), не просто (attemptId).
    describe('itemId (ADR-0037)', () => {
      it('две ссылки на разные video-вопросы одной попытки — сохраняются обе', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1',
          NOW,
          VIDEO_ITEM_ID,
        );
        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-2',
          NOW,
          OTHER_VIDEO_ITEM_ID,
        );

        const list = await service.listForAttempt(attemptId);
        expect(list).toHaveLength(2);
        expect(list.map((m) => m.itemId).sort()).toEqual(
          [VIDEO_ITEM_ID, OTHER_VIDEO_ITEM_ID].sort(),
        );
      });

      it('вторая ссылка на ТОТ ЖЕ вопрос — заменяет первую, другой вопрос не задет', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });
        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1',
          NOW,
          VIDEO_ITEM_ID,
        );
        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-2',
          NOW,
          OTHER_VIDEO_ITEM_ID,
        );

        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1-fixed',
          NOW.plus({ minutes: 1 }),
          VIDEO_ITEM_ID,
        );

        const list = await service.listForAttempt(attemptId);
        expect(list).toHaveLength(2);
        const replaced = list.find((m) => m.itemId === VIDEO_ITEM_ID);
        const untouched = list.find((m) => m.itemId === OTHER_VIDEO_ITEM_ID);
        expect(replaced?.url).toBe('https://vk.com/video-1-fixed');
        expect(untouched?.url).toBe('https://vk.com/video-2');
      });

      it('itemId, которого нет в снимке — NotFoundError, ничего не сохранено', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        await expect(
          service.addLink(
            attemptId,
            USER_A,
            'https://vk.com/video-1',
            NOW,
            new Types.ObjectId().toString(),
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
        await expect(mediaModel.countDocuments({})).resolves.toBe(0);
      });

      it('itemId вопроса не video (text) — NotFoundError', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        await expect(
          service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW, TEXT_ITEM_ID),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    // ADR-0084: ссылка добавлена успешно — учитель узнаёт об этом, не
    // открывая карточку проверки сам.
    describe('уведомление (ADR-0084)', () => {
      it('успешная ссылка — зовёт нотификатор с верным контекстом, включая формулировку вопроса', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1',
          NOW,
          OTHER_VIDEO_ITEM_ID,
        );

        expect(notifyVideoLinkAdded).toHaveBeenCalledWith(
          {
            attemptId,
            // expect.any(...) типизирован как `any` в @types/jest — приводим к
            // string, тот же повод, что channels/telegram.adapter.spec.ts.
            examId: expect.any(String) as string,
            examTitle: 'Форма первого уровня',
            userId: USER_A,
            // Формулировка, а не номер: номеров у вопроса три разных
            // (карточка проверки, сводка бота, форма сдачи) —
            // комментарий в media-item-lookup.ts.
            questionPrompt: 'И ещё одну',
            url: 'https://vk.com/video-1',
          },
          NOW,
        );
      });

      it('itemId не передан — questionPrompt: null, нотификатор всё равно позван', async () => {
        const attemptId = await seedAttempt(USER_A);

        await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);

        expect(notifyVideoLinkAdded).toHaveBeenCalledWith(
          expect.objectContaining({ questionPrompt: null }),
          NOW,
        );
      });

      it('замена ссылки на тот же вопрос — тоже зовёт нотификатор', async () => {
        const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });
        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1',
          NOW,
          VIDEO_ITEM_ID,
        );
        notifyVideoLinkAdded.mockClear();

        await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1-fixed',
          NOW.plus({ minutes: 1 }),
          VIDEO_ITEM_ID,
        );

        expect(notifyVideoLinkAdded).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://vk.com/video-1-fixed' }),
          NOW.plus({ minutes: 1 }),
        );
      });

      it('нотификатор бросил — addLink всё равно вернул DTO (best-effort)', async () => {
        notifyVideoLinkAdded.mockRejectedValue(new Error('бот недоступен'));
        const attemptId = await seedAttempt(USER_A);

        const dto = await service.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1',
          NOW,
        );

        expect(dto.url).toBe('https://vk.com/video-1');
      });

      it('нотификатор не собран (ExamsModule не поднят) — addLink не падает', async () => {
        const emptyRegistry = new ExamMediaNotifierRegistry();
        const bareService = new MediaAssetsService(
          mediaModel,
          attemptModel,
          new UsersService(userModel),
          emptyRegistry,
          deliveryRegistry,
        );
        const attemptId = await seedAttempt(USER_A);

        const dto = await bareService.addLink(
          attemptId,
          USER_A,
          'https://vk.com/video-1',
          NOW,
        );

        expect(dto.url).toBe('https://vk.com/video-1');
      });
    });
  });

  describe('addManual', () => {
    it('владельца берёт из попытки, не из вызывающего (учитель отмечает чужую)', async () => {
      const attemptId = await seedAttempt(USER_A);

      const dto = await service.addManual(attemptId, 'Прислал в WhatsApp', NOW);

      expect(dto.kind).toBe('manual');
      expect(dto.note).toBe('Прислал в WhatsApp');
      const raw = await mediaModel.findById(dto.id).lean();
      expect(raw?.userId.toString()).toBe(USER_A);
    });

    it('несуществующая попытка — NotFoundError', async () => {
      await expect(
        service.addManual(new Types.ObjectId().toString(), 'заметка', NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('запись не найдена сразу после создания (защита в глубину) — программная ошибка', async () => {
      const attemptId = await seedAttempt(USER_A);
      jest.spyOn(mediaModel, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve(null),
      } as never);

      await expect(service.addManual(attemptId, 'заметка', NOW)).rejects.toThrow(
        'запись не найдена сразу после создания',
      );
    });

    it('itemId, которого нет в снимке (ADR-0037) — NotFoundError', async () => {
      const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

      await expect(
        service.addManual(attemptId, 'заметка', NOW, new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('video-вопрос снимка — отметка привязывается с itemId', async () => {
      const attemptId = await seedAttempt(USER_A, { blocks: BLOCKS_WITH_VIDEO });

      const dto = await service.addManual(attemptId, 'заметка', NOW, VIDEO_ITEM_ID);

      expect(dto.itemId).toBe(VIDEO_ITEM_ID);
    });

    // Отметку ставит сам учитель — слать ему уведомление о его же действии
    // незачем (комментарий у addManual, media-assets.service.ts).
    it('не зовёт нотификатор (ADR-0084) — отметку ставит сам учитель', async () => {
      const attemptId = await seedAttempt(USER_A);

      await service.addManual(attemptId, 'заметка', NOW);

      expect(notifyVideoLinkAdded).not.toHaveBeenCalled();
    });
  });

  describe('listForAttempts', () => {
    it('один запрос на несколько попыток — недавнее сверху', async () => {
      const attemptA = await seedAttempt(USER_A);
      const attemptB = await seedAttempt(USER_B);
      await service.addLink(attemptA, USER_A, 'https://vk.com/a', NOW);
      await service.addManual(attemptB, undefined, NOW.plus({ minutes: 1 }));

      const byAttempt = await service.listForAttempts([attemptA, attemptB, 'not-an-id']);

      expect(byAttempt.get(attemptA)).toHaveLength(1);
      expect(byAttempt.get(attemptB)).toHaveLength(1);
      expect(byAttempt.has('not-an-id')).toBe(false);
    });

    it('пустой список id — пустая карта, без запроса к базе', async () => {
      const byAttempt = await service.listForAttempts([]);
      expect(byAttempt.size).toBe(0);
    });
  });

  describe('listForAttempt', () => {
    it('у попытки есть видео — отдаёт его', async () => {
      const attemptId = await seedAttempt(USER_A);
      await service.addLink(attemptId, USER_A, 'https://vk.com/video', NOW);

      const media = await service.listForAttempt(attemptId);

      expect(media).toHaveLength(1);
      expect(media[0]?.url).toBe('https://vk.com/video');
    });

    // Попытка без видео — пустой список, не `undefined`: карточка проверки
    // и экран ученика рисуют «видео нет», а не падают на отсутствии ключа.
    it('видео ещё не присылали — пустой список', async () => {
      const attemptId = await seedAttempt(USER_A);

      await expect(service.listForAttempt(attemptId)).resolves.toEqual([]);
    });

    it('id не в форме ObjectId — тоже пустой список, не ошибка', async () => {
      await expect(service.listForAttempt('не-id')).resolves.toEqual([]);
    });
  });

  // ADR-0095: кнопка «Прислать мне в бота» на карточке проверки.
  describe('sendToChat', () => {
    function fakeDeliveryPort(
      chatId: string | null,
      sendResult = true,
    ): {
      port: ExamVideoDeliveryPort;
      calls: Parameters<ExamVideoDeliveryPort['sendVideo']>[0][];
    } {
      const calls: Parameters<ExamVideoDeliveryPort['sendVideo']>[0][] = [];
      return {
        port: {
          resolveChatId: () => Promise.resolve(chatId),
          sendVideo: (input) => {
            calls.push(input);
            return Promise.resolve(sendResult);
          },
        },
        calls,
      };
    }

    /** `attachTelegramVideo` типизирован как `| null` (защита в глубину на
     * несуществующую попытку), но в этих тестах попытка всегда своя — падение
     * здесь было бы ошибкой сетапа теста, не проверяемым сценарием, поэтому
     * `throw`, а не `!` (CLAUDE.md «Код»: non-null assertion — только с
     * причиной, здесь причины нет, а явная проверка яснее). */
    async function seedTelegramMedia(
      attemptId: string,
      userId: string,
      telegramType?: 'video' | 'video_note' | 'document',
    ): Promise<string> {
      const attached = await service.attachTelegramVideo(
        attemptId,
        userId,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID, telegramType },
        NOW,
      );
      if (!attached) throw new Error('setup: attachTelegramVideo вернул null');
      return attached.media.id;
    }

    it('запись другой попытки — NotFoundError, порт не звался', async () => {
      const attemptId = await seedAttempt(USER_A);
      const otherAttemptId = await seedAttempt(USER_B);
      const mediaId = await seedTelegramMedia(otherAttemptId, USER_B);
      const { port, calls } = fakeDeliveryPort('777');
      deliveryRegistry.set(port);

      await expect(service.sendToChat(attemptId, mediaId, USER_A)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(calls).toEqual([]);
    });

    it('kind: link — NotFoundError, порт не звался', async () => {
      const attemptId = await seedAttempt(USER_A);
      const link = await service.addLink(attemptId, USER_A, 'https://vk.com/video', NOW);
      const { port, calls } = fakeDeliveryPort('777');
      deliveryRegistry.set(port);

      await expect(service.sendToChat(attemptId, link.id, USER_A)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(calls).toEqual([]);
    });

    it('kind: manual — NotFoundError, порт не звался', async () => {
      const attemptId = await seedAttempt(USER_A);
      const manual = await service.addManual(attemptId, 'заметка', NOW);
      const { port, calls } = fakeDeliveryPort('777');
      deliveryRegistry.set(port);

      await expect(
        service.sendToChat(attemptId, manual.id, USER_A),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(calls).toEqual([]);
    });

    it('несуществующая запись — NotFoundError', async () => {
      const attemptId = await seedAttempt(USER_A);
      const { port } = fakeDeliveryPort('777');
      deliveryRegistry.set(port);

      await expect(
        service.sendToChat(attemptId, new Types.ObjectId().toString(), USER_A),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    // Защита в глубину: media_assets не ссылается на exam_attempts внешним
    // ключом, поэтому попытка теоретически может исчезнуть после того, как
    // видео к ней уже привязано (например, независимое удаление данных).
    it('попытка исчезла после привязки видео — NotFoundError, порт не звался', async () => {
      const attemptId = await seedAttempt(USER_A);
      const mediaId = await seedTelegramMedia(attemptId, USER_A);
      await attemptModel.deleteOne({ _id: new Types.ObjectId(attemptId) });
      const { port, calls } = fakeDeliveryPort('777');
      deliveryRegistry.set(port);

      await expect(service.sendToChat(attemptId, mediaId, USER_A)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(calls).toEqual([]);
    });

    it('нет активного чата у вызывающего — ConflictError, Telegram не звался', async () => {
      const attemptId = await seedAttempt(USER_A);
      const mediaId = await seedTelegramMedia(attemptId, USER_A);
      const { port, calls } = fakeDeliveryPort(null);
      deliveryRegistry.set(port);

      await expect(service.sendToChat(attemptId, mediaId, USER_A)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(calls).toEqual([]);
    });

    it('Telegram отказал принять видео — ConflictError', async () => {
      const attemptId = await seedAttempt(USER_A);
      const mediaId = await seedTelegramMedia(attemptId, USER_A);
      const { port } = fakeDeliveryPort('555', false);
      deliveryRegistry.set(port);

      await expect(service.sendToChat(attemptId, mediaId, USER_A)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('успешный путь — порт получает расшифрованный fileId и сохранённый тип вложения', async () => {
      const attemptId = await seedAttempt(USER_A);
      const mediaId = await seedTelegramMedia(attemptId, USER_A, 'video_note');
      const { port, calls } = fakeDeliveryPort('555');
      deliveryRegistry.set(port);

      await service.sendToChat(attemptId, mediaId, USER_A);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        chatId: '555',
        fileId: FILE_ID,
        telegramType: 'video_note',
      });
      expect(calls[0]?.caption).toContain('Форма первого уровня');
    });
  });
});
