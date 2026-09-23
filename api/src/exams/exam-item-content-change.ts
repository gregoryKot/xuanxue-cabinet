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

/** Поля, ради которых версия и заводится: формулировка, варианты. Статус —
 * не содержание вопроса. */
type ContentSnapshot = Pick<ExamItemVersionRecord, 'prompt'>;

/** `null` (явный сброс) и `undefined` (поля нет в запросе) — разные вещи:
 * первое меняет пустое значение на пустое только если оно и было пустым. */
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
    textChanged(input.prompt, current.prompt) ||
    optionsChanged(nextOptions, current.options)
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
    options: current.options,
    replacedAt,
  };
}
