// Общие подписи и мелкие чистые хелперы диалога «Собрать экзамен» (ТЗ 4б.4,
// docs/PLAN.md §12) — тем же приёмом, что new-exam-item-types.ts у диалога
// «Новый вопрос»: api не импортирует web (CLAUDE.md «Слои»), кнопка Telegram
// объясняет себя сама, отдельной подписи из кабинета слово в слово не нужно.
import type { InlineKeyboardButton } from 'telegraf/types';
import type { NewExamStep } from '../bot-session.schema';
import type { BotSessionLean } from '../bot-session.lean';
import { inlineButton } from '../callback-data';
import type { NewExamDraft } from '../new-exam-draft-wait';

/** «Отмена» есть на каждом шаге диалога (ТЗ 4б.4) — одна кнопка, не по
 * реализации на экран (CLAUDE.md «Одна механика — один компонент»). */
export function newExamCancelButton(): InlineKeyboardButton[] {
  return [inlineButton('Отмена', 'nef', 'cancel')];
}

/** Активная сборка (kind 'examBuildDraft' с известным шагом) — команда/кнопка
 * меню заводят сессию сразу (bot-session.service.ts, startNewExamDraft), в
 * отличие от screen 1 «Нового вопроса», поэтому guard проще: `buildStep`
 * есть у любой активной сборки, начиная с шага 'pick'. */
export function isActiveNewExamDraft(
  session: BotSessionLean | null,
): session is BotSessionLean & { buildStep: NewExamStep } {
  return session?.kind === 'examBuildDraft' && session.buildStep !== undefined;
}

/** `BotSessionLean` (build*-поля) → `NewExamDraft` (screens/save) — одна
 * точка сборки, экраны и сохранение не читают build*-имена сами. */
export function sessionToNewExamDraft(
  session: BotSessionLean & { buildStep: NewExamStep },
): NewExamDraft {
  return {
    step: session.buildStep,
    page: session.buildPage ?? 0,
    itemIds: (session.buildItemIds ?? []).map((id) => id.toString()),
    title: session.buildTitle,
    timeLimitMin: session.buildTimeLimitMin,
    attemptsAllowed: session.buildAttemptsAllowed,
    savedExamId: session.buildSavedExamId?.toString(),
  };
}

const BUTTON_PROMPT_MAX = 46;

/** Формулировка на кнопке отметки (шаг 'pick') — обрезана: кнопка Telegram
 * тесная, а рядом ещё галочка и номер. Тот же приём, что truncateForButton
 * в exam-list-screen.ts, своя длина под чекбокс впереди. */
export function truncatePromptForButton(prompt: string): string {
  return prompt.length > BUTTON_PROMPT_MAX
    ? `${prompt.slice(0, BUTTON_PROMPT_MAX - 1)}…`
    : prompt;
}
