// Поднимать ли версию опубликованного вопроса — по сути правки, а не по
// факту присланного поля (exam-items.service.ts, ТЗ 4.2 п.3).
//
// Почему не «поле пришло — значит изменилось»: форма экрана «Вопросы» шлёт
// все содержательные поля разом, и «открыл, ничего не тронул, нажал
// Сохранить» поднимало версию и клало в историю пустую запись. История —
// доказательство того, что именно видел сдающий; мусор в ней обесценивает
// её ровно тогда, когда она понадобится. Сравнение живёт на сервере, а не в
// форме: так защищён и будущий конструктор экзамена, и бот, и любой другой
// клиент.
import type { UpdateExamItemInput } from '@xuanxue/shared';
import type { ExamItemOptionRecord, ExamItemVersionRecord } from './exam-item.schema';

/** Поля, ради которых версия и заводится: формулировка, её видео, варианты,
 * требование объяснения (ADR-0146 — правка того, что видел сдающий).
 * Статус — не содержание вопроса. */
type ContentSnapshot = Pick<
  ExamItemVersionRecord,
  'prompt' | 'videoId' | 'videoUrl' | 'askReason'
>;

/** Формулировка обязательна и не сбрасывается (`null` отсекает DTO), поэтому
 * сравниваем прямо: поля нет в запросе — правки нет. */
function promptChanged(next: string | undefined, current: string): boolean {
  return next !== undefined && next !== current;
}

/** Видео вопроса сбрасывается явно: `null` (сброс) и `undefined` (поля нет в
 * запросе) — разные вещи, пустое на пустое правкой не считается. */
function textChanged(next: string | null | undefined, current: string | undefined) {
  if (next === undefined) return false;
  return (next ?? undefined) !== (current || undefined);
}

/** Варианты сравниваются уже нормализованными (`mapOptions`): id
 * существующего варианта сохраняется, поэтому одинаковый набор даёт
 * одинаковый JSON, а добавленный вариант — новый id и другой. */
function optionsChanged(
  next: ExamItemOptionRecord[] | undefined,
  current: ExamItemOptionRecord[],
): boolean {
  if (next === undefined) return false;
  return JSON.stringify(next) !== JSON.stringify(current);
}

export function hasContentChanged(
  input: UpdateExamItemInput,
  nextOptions: ExamItemOptionRecord[] | undefined,
  current: ContentSnapshot & { options: ExamItemOptionRecord[] },
): boolean {
  return (
    promptChanged(input.prompt, current.prompt) ||
    textChanged(input.videoId, current.videoId) ||
    textChanged(input.videoUrl, current.videoUrl) ||
    optionsChanged(nextOptions, current.options) ||
    (input.askReason !== undefined && input.askReason !== Boolean(current.askReason))
  );
}

/** Снимок ДО правки — кладётся в history при поднятии версии опубликованного
 * вопроса (exam-items.service.ts, `update`). Вынесено отдельно от сервиса,
 * чтобы сборка объекта не раздувала его файл (CLAUDE.md «Файлы», лимит
 * размера — exam-items.service.ts держится ровно на границе). */
export function buildHistoryEntry(
  current: ContentSnapshot & { version: number; options: ExamItemOptionRecord[] },
  replacedAt: string,
): ExamItemVersionRecord {
  return {
    version: current.version,
    prompt: current.prompt,
    ...(current.videoId !== undefined ? { videoId: current.videoId } : {}),
    ...(current.videoUrl !== undefined ? { videoUrl: current.videoUrl } : {}),
    options: current.options,
    ...(current.askReason ? { askReason: true } : {}),
    replacedAt,
  };
}
