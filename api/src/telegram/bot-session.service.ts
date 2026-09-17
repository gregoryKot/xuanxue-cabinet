// CRUD ожидания бота в чате (bot-session.schema.ts) — единственная точка
// чтения/записи `bot_sessions`, тем же приёмом, что UsersService для users.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { ExamItemKind } from '@xuanxue/shared';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import {
  BOT_SESSION_ENCRYPT_SCHEMA,
  BotSessionRecord,
  type BotSessionKind,
  type NewExamItemStep,
} from './bot-session.schema';
import { examAnswerWaitUpdate } from './exam-answer-wait';
import {
  newExamItemDraftUpdate,
  startNewExamItemDraftUpdate,
  type NewExamItemDraftOption,
  type NewExamItemDraftPatch,
} from './new-exam-item-draft-wait';

// Предпросмотр «Изменить тему» и команда /тема ждут ответ недолго — 10 минут
// (PLAN.md §6); «Запись?» ждёт куда дольше — снять запись можно не сразу
// (EXAM_ANSWER_WAIT_HOURS в exam-answer-wait.ts — то же число для ответа на
// вопрос экзамена, по той же причине).
const TOPIC_WAIT_MINUTES = 10;
const RECORDING_WAIT_HOURS = 12;

export interface BotSessionLean {
  kind: BotSessionKind;
  /** Есть только у kind 'topic'/'recording'. */
  lessonId?: Types.ObjectId;
  /** Есть только у kind 'examMedia'/'examText'. */
  attemptId?: Types.ObjectId;
  /** Номер вопроса (bot-session.schema.ts) — есть у 'examText' всегда, у
   * 'examMedia' только внутри потока вопросов бота. */
  questionIndex?: number | null;
  /** Вопрос-видео (ADR-0037, bot-session.schema.ts) — есть только у
   * 'examMedia', когда он известен (deep link с вопросом или поток бота). */
  itemId?: Types.ObjectId | null;
  /** Черновик вопроса (ТЗ 4б.3) — есть только у 'examItemDraft', уже
   * расшифрован (get()). `options: []`, не `undefined`, когда вариантов пока
   * нет — тем же приёмом, что assertOptionsForKind у самого банка вопросов. */
  draftStep?: NewExamItemStep;
  draftKind?: ExamItemKind;
  draftPrompt?: string;
  draftCriteria?: string;
  draftOptions?: NewExamItemDraftOption[];
  draftSavedItemId?: Types.ObjectId;
}

/** `BotSessionLean` до расшифровки — `draftPrompt`/`draftCriteria`/
 * `draftOptions` ещё шифротекст/JSON-строка (тот же приём, что
 * RawLeanExamItem/LeanExamItem у самого банка вопросов, exam-item.mapper.ts). */
type RawBotSessionLean = Omit<
  BotSessionLean,
  'draftPrompt' | 'draftCriteria' | 'draftOptions'
> & {
  draftPrompt?: string;
  draftCriteria?: string;
  draftOptions?: string;
};

@Injectable()
export class BotSessionService {
  constructor(
    @InjectModel(BotSessionRecord.name) private readonly model: Model<BotSessionRecord>,
  ) {}

  /** Новое ожидание вытесняет старое — один документ на чат (upsert по
   * уникальному индексу `chatId`), учитель отвечает на последнее, что видит. */
  async startTopicWait(chatId: number, lessonId: string, now: DateTime): Promise<void> {
    await this.set(chatId, 'topic', lessonId, now.plus({ minutes: TOPIC_WAIT_MINUTES }));
  }

  async startRecordingWait(
    chatId: number,
    lessonId: string,
    now: DateTime,
  ): Promise<void> {
    await this.set(
      chatId,
      'recording',
      lessonId,
      now.plus({ hours: RECORDING_WAIT_HOURS }),
    );
  }

  /** Ждём видео экзамена — либо после deep link
   * `t.me/<бот>?start=exam_<attemptId>[_<itemId>]` (ADR-0023/ADR-0037,
   * `questionIndex` не передан), либо с экрана вопроса-видео внутри потока
   * бота (ТЗ 4б.2 часть 2, оба переданы) — открыт ЛЮБОМУ пользователю
   * Telegram, не через `set()`: то ведёт только `lessonId`, это — только
   * `attemptId`/`itemId`. Само содержимое апдейта — exam-answer-wait.ts. */
  async startExamMediaWait(
    chatId: number,
    attemptId: string,
    now: DateTime,
    questionIndex?: number,
    itemId?: string,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      { $set: examAnswerWaitUpdate('examMedia', attemptId, questionIndex, now, itemId) },
      { upsert: true },
    );
  }

  /** Ждём свободный текст ответа на вопрос попытки (ТЗ 4б.2 часть 2) — экран
   * вопроса ставит это ожидание при каждом показе text-вопроса
   * (exam-question-render.ts), номер вопроса обязателен: без него закрывать
   * ожидание после ответа было бы нечем адресовать. */
  async startExamTextWait(
    chatId: number,
    attemptId: string,
    questionIndex: number,
    now: DateTime,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      { $set: examAnswerWaitUpdate('examText', attemptId, questionIndex, now) },
      { upsert: true },
    );
  }

  /** Активное (не истёкшее) ожидание чата — TTL-индекс подчищает документ с
   * задержкой до минуты (SERVER-точность монитора Mongo), поэтому фильтр по
   * `expiresAt` здесь же, не только надежда на TTL. draft*-поля расшифровываются
   * здесь же (decryptRecord) — читающий черновик мимо этого метода получил бы
   * шифротекст, тем же приёмом, что decryptExamItem у банка вопросов. */
  async get(chatId: number, now: DateTime): Promise<BotSessionLean | null> {
    const doc = await this.model
      .findOne(
        { chatId, expiresAt: { $gt: now.toJSDate() } },
        {
          kind: 1,
          lessonId: 1,
          attemptId: 1,
          questionIndex: 1,
          itemId: 1,
          draftStep: 1,
          draftKind: 1,
          draftPrompt: 1,
          draftCriteria: 1,
          draftOptions: 1,
          draftSavedItemId: 1,
        },
      )
      .lean<RawBotSessionLean | null>();
    if (!doc) return null;
    const decrypted = decryptRecord(doc, BOT_SESSION_ENCRYPT_SCHEMA);
    return {
      ...doc,
      draftPrompt: decrypted.draftPrompt,
      draftCriteria: decrypted.draftCriteria,
      draftOptions:
        (decrypted.draftOptions as unknown as NewExamItemDraftOption[] | undefined) ?? [],
    };
  }

  /** Начинает черновик вопроса (screen 1, ТЗ 4б.3) — новое ожидание
   * вытесняет старое, тем же приёмом, что startTopicWait. */
  async startNewExamItemDraft(
    chatId: number,
    kind: ExamItemKind,
    now: DateTime,
  ): Promise<void> {
    const { $set, $unset } = startNewExamItemDraftUpdate(kind, now);
    await this.model.updateOne(
      { chatId },
      { $set: encryptRecord($set, BOT_SESSION_ENCRYPT_SCHEMA), $unset },
      { upsert: true },
    );
  }

  /** Шаг вперёд внутри уже начатого черновика (формулировка/варианты/
   * критерии/сохранение) — черновик копится в bot_sessions, а не в отдельной
   * коллекции (ADR-0024, комментарий у kind в bot-session.schema.ts).
   * Свободный текст/варианты шифруются перед записью тем же приёмом, что у
   * самого банка вопросов (ExamItemsService.create). */
  async setNewExamItemDraft(
    chatId: number,
    patch: NewExamItemDraftPatch,
    now: DateTime,
  ): Promise<void> {
    const update = encryptRecord(
      newExamItemDraftUpdate(patch, now),
      BOT_SESSION_ENCRYPT_SCHEMA,
    );
    await this.model.updateOne({ chatId }, { $set: update }, { upsert: true });
  }

  async clear(chatId: number): Promise<void> {
    await this.model.deleteOne({ chatId });
  }

  /** Закрывает ожидание, только если оно про ЭТО занятие («Записи не будет»
   * под конкретным «Запись?» — CLAUDE.md «Ноль нагрузки» наоборот: чужую,
   * более новую просьбу той же кнопкой не гасим). Учитель успел получить
   * второй вопрос «Запись?» по другому занятию раньше, чем ответил на
   * первый, — «Записи не будет» под первым не должно погасить ожидание
   * второго. */
  async clearIfLesson(chatId: number, lessonId: string): Promise<void> {
    await this.model.deleteOne({ chatId, lessonId: new Types.ObjectId(lessonId) });
  }

  /** Документ есть, но `expiresAt` уже прошёл — отличить «никогда не ждали»
   * (тихо игнорируем чужое сообщение) от «ждали, но учитель не успел»: во
   * втором случае бот отвечает, что ожидание истекло, а не молчит, причём
   * текст разный для темы и записи (message.handler.ts) — поэтому возвращаем
   * `kind`, а не просто факт. TTL может не успеть подчистить документ
   * (задержка до минуты, как в get()) — фильтр по `expiresAt` тот же приём. */
  async hasExpired(chatId: number, now: DateTime): Promise<BotSessionKind | null> {
    const doc = await this.model
      .findOne({ chatId, expiresAt: { $lte: now.toJSDate() } }, { kind: 1 })
      .lean<{ kind: BotSessionKind } | null>();
    return doc?.kind ?? null;
  }

  private async set(
    chatId: number,
    kind: 'topic' | 'recording',
    lessonId: string,
    expiresAt: DateTime,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      {
        $set: {
          kind,
          lessonId: new Types.ObjectId(lessonId),
          expiresAt: expiresAt.toJSDate(),
        },
      },
      { upsert: true },
    );
  }
}
