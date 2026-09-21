// «Запись?» — шаг тика (docs/PLAN.md §6 «Telegram-бот для учителя»): занятие
// закончилось (startsAt + durationMin ≤ now), бот ещё не спрашивал
// (recordingPromptedAt), класс активен → условный апдейт recordingPromptedAt
// (ДО отправки — второй тик/инстанс не спросит дважды) → каждому учителю
// текст + кнопка «Записи не будет», ожидание — bot_sessions kind 'recording'.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { claimAndRun } from '../common/claim-once';
import { errorMessage, errorStack } from '../common/error-info';
import { ClassRecord } from '../classes/class.schema';
import { inlineButton } from '../telegram/callback-data';
import { BotSessionService } from '../telegram/bot-session.service';
import { PersonalChats, type PersonalChat } from '../telegram/personal-chats';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { LessonRecord } from './lesson.schema';

// Запас, чтобы не пересканировать всю историю scheduled-занятий без
// recordingPromptedAt (тот же приём, что DUE_LOOKBACK_MINUTES у планировщика
// рассылок) — занятие старше недели без записи спрашивать уже поздно.
const LOOKBACK_DAYS = 7;
// Кандидатов на тик — не «дай всё» (CLAUDE.md «API»): при массовой отмене
// занятий (день без интернета у школы и т. п.) сотни вопросов в один тик
// уткнутся в 429 Telegram; 20 на тик — тот же порядок, что делает раннер
// доставок, следующий тик доберёт остаток.
const PROMPT_BATCH_LIMIT = 20;

interface DueLesson {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  topic: string;
  startsAt: Date;
  durationMin: number;
}

export interface RecordingPromptResult {
  prompted: number;
}

@Injectable()
export class RecordingPromptService {
  private readonly logger = new Logger(RecordingPromptService.name);

  constructor(
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly personalChats: PersonalChats,
    private readonly botSessions: BotSessionService,
    private readonly bot: TelegramBotService,
  ) {}

  async prompt(now: DateTime): Promise<RecordingPromptResult> {
    // В отличие от PreviewService (тот копит previewSentAt даже без
    // получателей — рассылка уйдёт по расписанию сама, предпросмотр лишь
    // уведомление), у «Запись?» это единственный канал сбора записи: если
    // сейчас никто не подключил бота, claim() навсегда закрыл бы вопрос —
    // спрашивать нужно на следующем тике, когда учитель нажмёт /start.
    // recording_request — вид уведомления «Напоминание про запись» (ТЗ
    // notifications-delivery.md §2): кто его выключил, тому не пишем.
    const chats = await this.personalChats.listFor('recording_request', now);
    if (chats.length === 0) return { prompted: 0 };

    const candidates = await this.lessonModel
      .find(
        {
          status: 'scheduled',
          recordingPromptedAt: { $exists: false },
          startsAt: {
            $gte: now.minus({ days: LOOKBACK_DAYS }).toJSDate(),
            $lte: now.toJSDate(),
          },
        },
        { classId: 1, topic: 1, startsAt: 1, durationMin: 1 },
      )
      .limit(PROMPT_BATCH_LIMIT)
      .lean<DueLesson[]>();
    const due = candidates.filter((lesson) => isLessonOver(lesson, now));

    let prompted = 0;
    for (const lesson of due) {
      const cls = await this.classModel
        .findOne({ _id: lesson.classId, active: true }, { title: 1, tz: 1 })
        .lean<{ title: string; tz: string } | null>();
      if (!cls) continue; // класс выключен/удалён — спрашивать не о чем
      // claimAndRun (аудит 2026-09-21, HIGH): раньше claim стоял без
      // try/catch — упади promptTeachers (например, botSessions.
      // startRecordingWait не записался в Mongo), отметка осталась бы
      // стоять навсегда, и вопрос учителю про запись не задался бы больше
      // никогда. Теперь падение снимает claim, следующий тик спросит снова.
      const done = await claimAndRun(
        this.lessonModel,
        lesson._id,
        'recordingPromptedAt',
        now,
        async () => {
          await this.promptTeachers(lesson, cls, chats, now);
          return true;
        },
        (error) =>
          this.logger.error(
            `«Запись?» для занятия ${lesson._id.toString()} упало после claim: ${errorMessage(error)}`,
            errorStack(error),
          ),
      );
      if (done) prompted += 1;
    }
    return { prompted };
  }

  private async promptTeachers(
    lesson: DueLesson,
    cls: { title: string; tz: string },
    chats: readonly PersonalChat[],
    now: DateTime,
  ): Promise<void> {
    const time = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' })
      .setZone(cls.tz)
      .toFormat('HH:mm');
    const text =
      `Занятие «${cls.title}» ${time} закончилось. Пришлите ссылку YouTube или ` +
      'видео — разошлю запись.';
    const buttons = [[inlineButton('Записи не будет', 'norec', lesson._id.toString())]];

    for (const chat of chats) {
      await this.botSessions.startRecordingWait(
        Number(chat.chatId),
        lesson._id.toString(),
        now,
      );
      await this.bot.sendMessage(chat.chatId, text, buttons);
    }
  }
}

function isLessonOver(lesson: DueLesson, now: DateTime): boolean {
  const endsAt = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' }).plus({
    minutes: lesson.durationMin,
  });
  return endsAt <= now;
}
