// Тип «прочитанного» ожидания бота (BotSessionLean) — проекция полей
// bot_sessions и его расшифровка. Вынесено из bot-session.service.ts, чтобы
// файл сервиса не рос выше потолка (CLAUDE.md, храповик
// check-file-size-ratchet.mjs, долг слоёв 4б.3–4б.5): тип импортируют восемь
// файлов хендлеров, а сама расшифровка используется только в get().
import { Types } from 'mongoose';
import type { ExamItemKind, GradingOutcome } from '@xuanxue/shared';
import { decryptRecord } from '../utils/encryption';
import {
  BOT_SESSION_ENCRYPT_SCHEMA,
  type BotSessionKind,
  type NewExamItemStep,
  type NewExamStep,
} from './bot-session.schema';
import type { NewExamItemDraftOption } from './new-exam-item-draft-wait';

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
  /** Месяц скриншота оплаты (ADR-0050, bot-session.schema.ts) — есть только
   * у 'payment'. */
  month?: string | null;
  /** Черновик вопроса (ТЗ 4б.3) — есть только у 'examItemDraft', уже
   * расшифрован (get()). `options: []`, не `undefined`, когда вариантов пока
   * нет — тем же приёмом, что assertOptionsForKind у самого банка вопросов. */
  draftStep?: NewExamItemStep;
  draftKind?: ExamItemKind;
  draftPrompt?: string;
  draftOptions?: NewExamItemDraftOption[];
  draftSavedItemId?: Types.ObjectId;
  /** Черновик сборки экзамена (ТЗ 4б.4) — есть только у 'examBuildDraft',
   * тем же приёмом, что draft*-поля выше. `buildItemIds`/`buildPage` не
   * бывают `undefined` в активном черновике (startNewExamDraftUpdate ставит
   * их сразу), но помечены опциональными — как и остальные kind-специфичные
   * поля этого интерфейса. */
  buildStep?: NewExamStep;
  buildItemIds?: Types.ObjectId[];
  buildPage?: number;
  buildTitle?: string;
  buildTimeLimitMin?: number;
  buildAttemptsAllowed?: number;
  buildSavedExamId?: Types.ObjectId;
  /** Итог проверки (ТЗ 4б.5) — есть только у 'gradeComment'. */
  outcome?: GradingOutcome;
}

/** `BotSessionLean` до расшифровки — `draftPrompt`/`draftOptions` ещё
 * шифротекст/JSON-строка (тот же приём, что RawLeanExamItem/LeanExamItem у
 * самого банка вопросов, exam-item.mapper.ts). */
export type RawBotSessionLean = Omit<
  BotSessionLean,
  'draftPrompt' | 'draftOptions' | 'buildTitle'
> & {
  draftPrompt?: string;
  draftOptions?: string;
  buildTitle?: string;
};

/** Проекция `findOne` для get() — только поля, из которых складывается
 * `BotSessionLean`, документ Mongoose наружу не возвращается (CLAUDE.md
 * «API», хотя bot_sessions не HTTP-ответ — тем же приёмом на всякий случай). */
export const BOT_SESSION_LEAN_PROJECTION = {
  kind: 1,
  lessonId: 1,
  attemptId: 1,
  questionIndex: 1,
  itemId: 1,
  month: 1,
  draftStep: 1,
  draftKind: 1,
  draftPrompt: 1,
  draftOptions: 1,
  draftSavedItemId: 1,
  buildStep: 1,
  buildItemIds: 1,
  buildPage: 1,
  buildTitle: 1,
  buildTimeLimitMin: 1,
  buildAttemptsAllowed: 1,
  buildSavedExamId: 1,
  outcome: 1,
} as const;

/** Расшифровка ожидания бота (get()) — draft*-поля расшифровываются здесь же
 * (decryptRecord), читающий черновик мимо этого метода получил бы шифротекст,
 * тем же приёмом, что decryptExamItem у банка вопросов. */
export function toBotSessionLean(doc: RawBotSessionLean): BotSessionLean {
  const decrypted = decryptRecord(doc, BOT_SESSION_ENCRYPT_SCHEMA);
  return {
    ...doc,
    draftPrompt: decrypted.draftPrompt,
    draftOptions:
      (decrypted.draftOptions as unknown as NewExamItemDraftOption[] | undefined) ?? [],
    buildTitle: decrypted.buildTitle,
  };
}
