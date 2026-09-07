// Подготовка добавляемой записи занятия — чистая логика, юнит-тест без Mongo
// (CLAUDE.md «Тесты»).
import { LESSON_LIMITS, type AddRecordingInput, type Recording } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

const NO_RECORDING_SOURCE = 'Добавьте ссылку на запись или отправьте видео боту';
const INVALID_RECORDING_URL =
  'Не получилось разобрать ссылку на запись. Проверьте, что это https-адрес, и пришлите ещё раз.';

/** Хотя бы одно из url/telegramFileId обязательно — иначе запись нечем
 * открыть: ни ссылки, ни файла у бота. */
export function assertHasRecordingSource(input: AddRecordingInput): void {
  if (input.url === undefined && input.telegramFileId === undefined) {
    throw new InvalidInputError(NO_RECORDING_SOURCE);
  }
}

/** Единственное место, где проверяется ссылка на запись (CLAUDE.md «Одна
 * механика — один компонент») — оба входа идут через `addRecording`
 * (LessonsService), у которого этот вызов один: DTO/HTTP уже провалидирован
 * class-validator'ом (`AddRecordingDto`), но бот шлёт `url` мимо DTO
 * (RecordingSource из текста сообщения) — без этой проверки его строка
 * дошла бы до базы и до поста рассылки без единой проверки формата. */
export function assertValidRecordingUrl(url: string | undefined): void {
  if (url === undefined) return;
  if (url.length > LESSON_LIMITS.url) throw new InvalidInputError(INVALID_RECORDING_URL);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidInputError(INVALID_RECORDING_URL);
  }
  // `host === ''` — защита в глубину, не мёртвый код только теоретически:
  // WHATWG `URL` уже бросает на пустом host для https (special scheme), но
  // явная проверка не завязана на это поведение парсера остаться таким.
  if (parsed.protocol !== 'https:' || parsed.host === '') {
    throw new InvalidInputError(INVALID_RECORDING_URL);
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

/** Условия для `$nor` в `updateOne` — повтор того же url/telegramFileId не
 * плодит вторую запись (CLAUDE.md «API»: повторяемое действие идемпотентно
 * по явному ключу, не по флагу в памяти). Поле, которого нет во входе, в
 * проверке не участвует; `assertHasRecordingSource` гарантирует, что хотя бы
 * одно условие тут будет — пустой `$nor` Mongo не принимает. */
export function buildRecordingDuplicateConditions(
  input: AddRecordingInput,
): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [];
  if (input.url !== undefined) conditions.push({ 'recordings.url': input.url });
  if (input.telegramFileId !== undefined) {
    conditions.push({ 'recordings.telegramFileId': input.telegramFileId });
  }
  return conditions;
}
