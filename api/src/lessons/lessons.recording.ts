// Подготовка добавляемой записи занятия — чистая логика, юнит-тест без Mongo
// (CLAUDE.md «Тесты»).
import type { AddRecordingInput, Recording } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

const NO_RECORDING_SOURCE = 'Добавьте ссылку на запись или отправьте видео боту';

/** Хотя бы одно из url/telegramFileId обязательно — иначе запись нечем
 * открыть: ни ссылки, ни файла у бота. */
export function assertHasRecordingSource(input: AddRecordingInput): void {
  if (input.url === undefined && input.telegramFileId === undefined) {
    throw new InvalidInputError(NO_RECORDING_SOURCE);
  }
}

/** title по умолчанию — название класса (docs/PLAN.md §6: подстановка
 * `{название}` в шаблонах = `recordings.title`); класса не нашлось — пустая
 * строка, не ошибка: запись всё равно нужно сохранить. */
export function buildRecordingPush(
  input: AddRecordingInput,
  classTitle: string,
): Recording {
  return {
    title: input.title ?? classTitle,
    url: input.url,
    telegramFileId: input.telegramFileId,
  };
}
