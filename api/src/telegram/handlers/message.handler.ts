// Текстовое/видео/документ-сообщение вне ответа на кнопку (docs/PLAN.md §6):
// активное ожидание чата решает, что это — тема, запись, видео экзамена
// (ADR-0023, слой 4.5) или свободный текст ответа на вопрос экзамена (ТЗ
// 4б.2 часть 2). Видео и текст экзамена ждём от ЛЮБОГО пользователя Telegram
// (экзамен сдают ученики) — проверяем и активное, и истёкшее ожидание
// экзамена ДО гейта `personalChats` ниже, который остаётся штатным для
// темы/записи (SECURITY.md §4: только личный чат учителя/админа с активным
// каналом — как у CallbackQueryHandler).
// `now` — параметром (CLAUDE.md «Время»), хендлер сам DateTime.utc() не зовёт.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { LESSON_LIMITS } from '@xuanxue/shared';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { LessonsService } from '../../lessons/lessons.service';
import { BotSessionService } from '../bot-session.service';
import { PersonalChats } from '../personal-chats';
import { ExamMediaMessageHandler } from './exam-media-message.handler';
import { ExamTextAnswerHandler } from './exam-text-answer.handler';
import { GradeCommentHandler } from './grade-comment.handler';
import { GRADE_COMMENT_EXPIRED_MESSAGE } from './grade-messages';
import { saveOrExplain } from './message-save';
import { NewExamMessageHandler } from './new-exam-message.handler';
import { NewExamItemMessageHandler } from './new-exam-item-message.handler';
import { RecordingWaitHandler } from './recording-wait.handler';
import { extractRecordingSource } from './recording-source';

const NOT_UNDERSTOOD_MESSAGE =
  'Не понял, к какому занятию это. Ответьте на сообщение бота о закончившемся ' +
  'занятии или добавьте запись в кабинете, в «Планировании».';
const TOPIC_EXPIRED_MESSAGE =
  'Ожидание истекло. Нажмите «Изменить тему» под сообщением ещё раз.';
const RECORDING_EXPIRED_MESSAGE =
  'Ожидание записи истекло. Добавьте запись в кабинете, в «Планировании» у этого занятия.';
// Раньше это ожидание проверялось только после гейта штата (`chats.some`
// ниже) и для ученика никогда не срабатывало — бот молча пропускал ответ,
// пришедший позже TTL (docs/PLAN.md §12, PR #175).
const EXAM_WAIT_EXPIRED_MESSAGE =
  'Ожидание ответа истекло. Откройте экзамен снова: команда /экзамены в боте или кнопка в кабинете.';
// Черновик вопроса (ТЗ 4б.3) — штатное ожидание, как у темы/записи: истёкшее
// проверяется тут же, после гейта personalChats ниже.
const NEW_EXAM_ITEM_EXPIRED_MESSAGE =
  'Время на вопрос истекло. Наберите /вопрос ещё раз — черновик придётся начать заново.';
// Сборка экзамена (ТЗ 4б.4) — тем же приёмом, что черновик вопроса выше.
const NEW_EXAM_EXPIRED_MESSAGE =
  'Время на сборку экзамена истекло. Наберите /экзамен ещё раз — черновик придётся начать заново.';

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly botSessions: BotSessionService,
    private readonly lessonsService: LessonsService,
    private readonly topicRebuild: TopicRebuildService,
    private readonly recordingWaitHandler: RecordingWaitHandler,
    private readonly examMediaHandler: ExamMediaMessageHandler,
    private readonly examTextHandler: ExamTextAnswerHandler,
    private readonly newExamItemHandler: NewExamItemMessageHandler,
    private readonly newExamHandler: NewExamMessageHandler,
    private readonly gradeCommentHandler: GradeCommentHandler,
  ) {}

  private readonly logSaveError = (message: string, stack?: string): void =>
    this.logger.error(`telegram.message: ${message}`, stack);

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      const from = ctx.from;
      if (!from) return;

      const session = await this.botSessions.get(from.id, now);
      if (session?.kind === 'examMedia') {
        await this.examMediaHandler.handle(ctx, from.id, session, now);
        return;
      }
      if (session?.kind === 'examText') {
        await this.examTextHandler.handle(ctx, from.id, session, now);
        return;
      }

      // Истёкшее ожидание экзамена — проверяем ДО гейта personalChats ниже
      // (тот пускает только штат): для ученика эта проверка раньше не
      // выполнялась вовсе, бот молча пропускал ответ (docs/PLAN.md §12, PR
      // #175). Активная сессия обработана выше и сюда не доходит — запрос
      // нужен только когда её нет.
      const expiredKind = session
        ? null
        : await this.botSessions.hasExpired(from.id, now);
      if (expiredKind === 'examText' || expiredKind === 'examMedia') {
        await ctx.reply(EXAM_WAIT_EXPIRED_MESSAGE).catch(() => null);
        return;
      }

      const chats = await this.personalChats.list(now);
      if (!chats.some((c) => c.chatId === String(from.id))) return;

      if (session?.kind === 'topic' && session.lessonId) {
        await this.handleTopic(ctx, session.lessonId, from.id, now);
        return;
      }
      if (session?.kind === 'recording' && session.lessonId) {
        await this.recordingWaitHandler.handle(
          ctx,
          session.lessonId,
          from.id,
          now,
          this.logSaveError,
        );
        return;
      }
      if (session?.kind === 'examItemDraft') {
        await this.newExamItemHandler.handle(ctx, from.id, session, now);
        return;
      }
      if (session?.kind === 'examBuildDraft') {
        await this.newExamHandler.handle(ctx, from.id, session, now);
        return;
      }
      if (session?.kind === 'gradeComment') {
        await this.gradeCommentHandler.handle(ctx, from.id, session, now);
        return;
      }
      if (expiredKind) {
        const text =
          expiredKind === 'recording'
            ? RECORDING_EXPIRED_MESSAGE
            : expiredKind === 'examItemDraft'
              ? NEW_EXAM_ITEM_EXPIRED_MESSAGE
              : expiredKind === 'examBuildDraft'
                ? NEW_EXAM_EXPIRED_MESSAGE
                : expiredKind === 'gradeComment'
                  ? GRADE_COMMENT_EXPIRED_MESSAGE
                  : TOPIC_EXPIRED_MESSAGE;
        await ctx.reply(text).catch(() => null);
        return;
      }
      // Без ожидания ссылка/видео — учитель шлёт запись не под тем
      // сообщением; обычный текст мимо ожидания бот не комментирует вовсе.
      if (extractRecordingSource(ctx.message)) {
        await ctx.reply(NOT_UNDERSTOOD_MESSAGE).catch(() => null);
      }
    } catch (err) {
      this.logger.error(`telegram.message: ${errorMessage(err)}`, errorStack(err));
    }
  }

  private async handleTopic(
    ctx: Context,
    lessonId: Types.ObjectId,
    chatId: number,
    now: DateTime,
  ): Promise<void> {
    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text || text.startsWith('/')) return; // не текст темы — ждём дальше, сессия не закрывается

    const topic = text.slice(0, LESSON_LIMITS.topic);
    const saved = await saveOrExplain(
      ctx,
      this.botSessions,
      chatId,
      async () => {
        await this.lessonsService.update(lessonId.toString(), { topic });
      },
      {
        notFound:
          'Занятие не найдено — возможно, его отменили. Откройте предпросмотр заново.',
        failed: 'Не получилось сохранить тему. Попробуйте ещё раз.',
      },
      this.logSaveError,
    );
    if (!saved) return;

    await this.botSessions.clear(chatId);
    const rebuilt = await this.topicRebuild.rebuild(lessonId, now);
    const suffix = rebuilt ? '' : '. Пост уже ушёл в каналы со старой темой.';
    await ctx.reply(`Тема сохранена: ${topic}${suffix}`).catch(() => null);
  }
}
