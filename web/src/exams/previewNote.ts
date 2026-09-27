// Заметка над списком предпросмотра «глазами ученика» — раньше это были два
// подряд идущих абзаца (сколько вопросов достаётся и перемешивается ли
// порядок), отзыв владельца 2026-09-27: подстрочники разжёвывают и отнимают
// место. Сведены в одну строку. Не в questionsPerAttempt.ts: тот держит
// подсказку и валидацию поля формы (другой экран), а эта заметка — про
// перемешивание и предпросмотр (ExamPreviewQuestions.tsx) и текстом к нему
// ближе.
import { pluralRu } from '@xuanxue/shared';
import { QUESTION_FORMS } from './examCounts';

function requiredClause(requiredCount: number): string {
  return requiredCount === 1
    ? '**1 обязательный** попадёт каждому'
    : `**${requiredCount} обязательных** попадут каждому`;
}

/** Оба перемешивания — про одно и то же (порядок у каждого сдающего свой),
 * поэтому одна фраза на оба случая, а не два предложения подряд об одном
 * (VOICE). */
function shuffleClause(
  shuffleQuestions: boolean,
  shuffleOptions: boolean,
): string | null {
  if (shuffleQuestions && shuffleOptions) return 'вопросы и варианты — в своём порядке';
  if (shuffleQuestions) return 'в своём порядке';
  if (shuffleOptions) return 'варианты ответа — в своём порядке';
  return null;
}

interface PreviewNoteParams {
  /** Всего вопросов в списке — список ниже показывает их все. */
  itemCount: number;
  /** Сколько из них достаётся одному сдающему (ADR-0082); `undefined` —
   * достаются все, отдельного упоминания не нужно. */
  questionsPerAttempt: number | undefined;
  /** Обязательные — не участвуют в случайности, попадают каждому (ADR-0082,
   * дополнение); уже очищены от вопросов, которых в списке больше нет. */
  requiredCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

/** `null` — сказать нечего: вопросов нет (пустой список — своя заметка,
 * ExamPreviewQuestions.tsx) или сдающему достаётся весь список в неизменном
 * порядке — то, что и так видно в списке ниже. */
export function previewNote({
  itemCount,
  questionsPerAttempt,
  requiredCount,
  shuffleQuestions,
  shuffleOptions,
}: PreviewNoteParams): string | null {
  if (itemCount === 0) return null;
  const shuffle = shuffleClause(shuffleQuestions, shuffleOptions);

  // Весь список без перемешивания — список ниже сам всё показывает,
  // отдельная строка ничего не добавляет (единственный факт, которого не
  // видно из статичного списка, — случайная часть или порядок).
  if (questionsPerAttempt === undefined) {
    return shuffle ? `Порядок вопросов — ${shuffle}.` : null;
  }

  const questionsForm = pluralRu(itemCount, QUESTION_FORMS);
  let note = `Ученику достанется **${questionsPerAttempt} из ${itemCount} ${questionsForm}**`;
  if (shuffle) note += `, ${shuffle}`;
  if (requiredCount > 0) note += `; ${requiredClause(requiredCount)}`;
  return `${note}.`;
}
