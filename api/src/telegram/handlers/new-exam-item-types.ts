// Общие подписи и мелкие чистые хелперы диалога «Новый вопрос» (ТЗ 4б.3,
// docs/PLAN.md §12) — separate от web/src/exam-items/examItemLabels.ts:
// api не импортирует web (CLAUDE.md «Слои»), а подписи в чате короче
// (кнопка Telegram уже сама себя объясняет соседней строкой текста, не
// нуждается в подписи из кабинета слово в слово).
import { EXAM_ITEM_KINDS, type ExamItemKind } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { BotSessionLean } from '../bot-session.service';
import { inlineButton } from '../callback-data';
import type {
  NewExamItemDraft,
  NewExamItemDraftOption,
} from '../new-exam-item-draft-wait';

/** «Отмена» есть на каждом шаге диалога (ТЗ 4б.3) — одна кнопка, не по
 * реализации на экран (CLAUDE.md «Одна механика — один компонент»). */
export function newExamItemCancelButton(): InlineKeyboardButton[] {
  return [inlineButton('Отмена', 'nqf', 'cancel')];
}

export const EXAM_ITEM_KIND_LABELS_BOT_RU: Record<ExamItemKind, string> = {
  text: 'Свободный ответ',
  single: 'Один правильный вариант',
  multiple: 'Несколько правильных',
  video: 'Видео',
};

/** Строка под кнопкой типа на screen 1 — что значит выбор, кто проверяет
 * ответ (та же мысль, что EXAM_ITEM_KIND_HINTS_RU в кабинете, слово не в
 * слово: там подпись под переключателем, здесь — пункт списка в тексте). */
export const EXAM_ITEM_KIND_HINTS_BOT_RU: Record<ExamItemKind, string> = {
  text: 'ученик пишет ответ словами, проверяете вы',
  single: 'ученик выбирает один вариант, ответ проверяется сам',
  multiple: 'ученик отмечает все верные варианты, проверяется сам',
  video: 'ученик присылает запись, оцениваете вы',
};

/** Типы с вариантами ответа — 'options'/'correct' шагов у text/video не
 * бывает (та же граница, что assertOptionsForKind, exam-item-options.ts, но
 * здесь просто список видов для ветвления экрана, не проверка). */
const KINDS_WITH_OPTIONS: readonly ExamItemKind[] = ['single', 'multiple'];

export function hasOptionsStep(kind: ExamItemKind): boolean {
  return KINDS_WITH_OPTIONS.includes(kind);
}

export function isExamItemKind(value: string): value is ExamItemKind {
  return (EXAM_ITEM_KINDS as readonly string[]).includes(value);
}

/** Активный черновик (kind 'examItemDraft' с типом вопроса) — screen 1
 * (`nqk`) и «Отмена» (`nqf:cancel`) единственные, кому черновик не нужен,
 * остальные хендлеры сверяют этим guard'ом. */
export function isActiveExamItemDraft(
  session: BotSessionLean | null,
): session is BotSessionLean & { draftKind: ExamItemKind } {
  return session?.kind === 'examItemDraft' && session.draftKind !== undefined;
}

/** `BotSessionLean` (draft*-поля) → `NewExamItemDraft` (screens/save) — одна
 * точка сборки, экраны и сохранение не читают draft*-имена сами. */
export function sessionToNewExamItemDraft(
  session: BotSessionLean & { draftKind: ExamItemKind },
): NewExamItemDraft {
  return {
    step: session.draftStep ?? 'prompt',
    kind: session.draftKind,
    prompt: session.draftPrompt,
    criteria: session.draftCriteria,
    options: session.draftOptions ?? [],
    savedItemId: session.draftSavedItemId?.toString(),
  };
}

/** Сколько вариантов отмечено верными — общая мелочь для экрана отметки и
 * для перехода «Готово» (correct-marking, ТЗ 4б.3). */
export function correctCount(options: readonly NewExamItemDraftOption[]): number {
  return options.filter((option) => option.correct).length;
}

/** Переключить один вариант (multiple, ТЗ 4б.3) — та же механика, что
 * nextOptionIds у ответа ученика (exam-attempt-answer.ts), только на
 * черновике, не на снимке попытки. */
export function toggleOptionCorrect(
  options: readonly NewExamItemDraftOption[],
  index: number,
): NewExamItemDraftOption[] {
  return options.map((option, i) =>
    i === index ? { ...option, correct: !option.correct } : option,
  );
}

/** Отметить единственный верный (single, ТЗ 4б.3) — выбор одного варианта
 * снимает отметку с прошлого (та же мысль, что nextOptionIds у single). */
export function markOnlyOptionCorrect(
  options: readonly NewExamItemDraftOption[],
  index: number,
): NewExamItemDraftOption[] {
  return options.map((option, i) => ({ ...option, correct: i === index }));
}
