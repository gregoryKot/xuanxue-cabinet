// Переключение варианта у вопроса `multiple` — чистая функция, которую
// exam-attempt-save.ts зовёт ВНУТРИ CAS-цикла по перечитанным ответам
// (аудит 2026-10-01, F27): бот считал «отмечен/снят» по состоянию, которое
// прочитал до сохранения, и два быстрых нажатия А и Б (параллельные
// callback_query) давали [Б] — mergeAnswers заменяет ответ по itemId целиком,
// CAS лишь ставил их по очереди. Теперь переключение считается по тому
// `current.answers`, на которое условится findOneAndUpdate, и параллельные
// А и Б дают [А, Б]. Юнит-тест без Mongo — exam-attempt-toggle-option.spec.ts.
import type { AttemptAnswerDto } from '@xuanxue/shared';

export interface ToggleOptionInput {
  itemId: string;
  optionId: string;
}

/** Ответ на вопрос после переключения `optionId`: был отмечен — снимается,
 * не был — добавляется в конец. `text` (объяснение выбора, ADR-0146)
 * переносится как есть — замена ответа вариантом не должна его стирать. */
export function toggleOptionAnswer(
  current: readonly AttemptAnswerDto[],
  { itemId, optionId }: ToggleOptionInput,
): AttemptAnswerDto {
  const existing = current.find((answer) => answer.itemId === itemId);
  const selected = existing?.optionIds ?? [];
  const optionIds = selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
  return {
    itemId,
    optionIds,
    ...(existing?.text !== undefined ? { text: existing.text } : {}),
  };
}
