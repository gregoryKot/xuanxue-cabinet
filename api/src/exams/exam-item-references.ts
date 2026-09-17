// Экзамены, ссылающиеся на вопрос банка (ADR-0022, ТЗ 4.2 п.4/4.3 п.5) —
// один источник для двух задач: защита при удалении/архивации вопроса
// (exam-items.service.ts, блокеры аудита 2026-09-15 №1 и №2 — вопрос,
// стоящий в неархивированном экзамене, ломал форму молча) и число «в скольких
// экзаменах используется» на карточке вопроса (exam-item-stats.service.ts).
// Один проход по базе на обе задачи, не два счётчика (CLAUDE.md «Одна
// механика — один компонент»).
//
// `blocks` хранится зашифрованной JSON-строкой (encJson, exam.schema.ts) —
// Mongo не видит `itemId` внутри и фильтровать запросом нельзя, поэтому
// приём тот же, что у ExamItemStatsService (exam-item-stats.service.ts,
// комментарий там же): один `find` по индексируемому полю (status) и проход
// по расшифрованным документам в памяти — школа на полсотни-сотню учеников
// держит десятки экзаменов, не тысячи, весь список свободно умещается.
// Архивный экзамен вопрос не ссылается опасно: его никто больше не
// редактирует и не выдаёт ученикам, поэтому он не в счёте и не в скане.
import type { Model } from 'mongoose';
import { pluralRu } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { decryptRecord } from '../utils/encryption';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord, type ExamBlockRecord } from './exam.schema';

// Верхняя граница запроса — защита от «дай всё» (CLAUDE.md «API»), а не
// ожидаемый размер: школа на полсотни учеников формирует десятки форм, не
// сотни. Если экзаменов больше — считаем по первым, число остальных врать
// не будет только в пределах этой границы, что для одной школы с запасом.
const MAX_EXAMS_SCANNED = 1000;

// «Первые несколько» в тексте отказа (ТЗ аудита: не просто число, а
// названия) — сколько выводим до «и ещё N».
const TITLES_IN_MESSAGE_LIMIT = 3;

const EXAM_COUNT_FORMS = { one: 'форма', few: 'формы', many: 'форм', other: 'формы' };

// `Pick<T, keyof T>`-приём не нужен здесь: `decryptRecord` требует
// `Record<string, unknown>`, а частичная выборка `.select('title blocks')`
// — уже ровно эти два поля, без лишних, достаточно index-signature.
interface ReferencingExamRow {
  [key: string]: unknown;
  title: string;
  blocks: string;
}

interface ExamReferences {
  /** Названия неархивированных экзаменов, где вопрос стоит хоть в одном
   * блоке — все, без обрезки: обрезка для текста ошибки происходит в
   * formatExamUsageList ниже, число «используется в N» берёт полную длину. */
  titles: string[];
}

/** Экзамены (не в архиве), которые ссылаются на `itemId` хоть в одном блоке —
 * используется и защитой удаления/архивации, и статистикой вопроса
 * (ExamItemStatsService.getStats, «usedInExamsCount»). */
export async function findExamsReferencingItem(
  examModel: Model<ExamRecord>,
  itemId: string,
): Promise<ExamReferences> {
  const docs = await examModel
    .find({ status: { $ne: 'archived' } })
    .select('title blocks')
    .limit(MAX_EXAMS_SCANNED)
    .lean<ReferencingExamRow[]>();
  const titles: string[] = [];
  for (const doc of docs) {
    const decrypted = decryptRecord(doc, EXAM_ENCRYPT_SCHEMA);
    const blocks = decrypted.blocks as unknown as ExamBlockRecord[];
    if (blocks.some((block) => block.itemIds.includes(itemId)))
      titles.push(decrypted.title);
  }
  return { titles };
}

/** ««А», «Б», «В» и ещё 2 формы» — первые несколько названий и число
 * остальных, не просто число: учителю на десятке вопросов не видно, какой
 * именно виноват, если сказать только «3 экзамена» (аудит 2026-09-15). */
export function formatExamUsageList(titles: readonly string[]): string {
  const shown = titles.slice(0, TITLES_IN_MESSAGE_LIMIT);
  const quoted = shown.map((title) => `«${title}»`).join(', ');
  const restCount = titles.length - shown.length;
  if (restCount <= 0) return quoted;
  return `${quoted} и ещё ${restCount} ${pluralRu(restCount, EXAM_COUNT_FORMS)}`;
}

async function assertItemNotReferenced(
  examModel: Model<ExamRecord>,
  itemId: string,
  messageTemplate: (list: string) => string,
): Promise<void> {
  const { titles } = await findExamsReferencingItem(examModel, itemId);
  if (titles.length === 0) return;
  throw new ConflictError(messageTemplate(formatExamUsageList(titles)));
}

// Тексты по VOICE.md (на «вы», что случилось и что сделать) живут здесь же,
// не в exam-items.service.ts: там и так вплотную к лимиту файла-храповика
// (CLAUDE.md «Храповики»), а обе проверки — один и тот же запрос с разным
// хвостом объяснения.

// Блокер аудита 2026-09-15 №1: removeIfDraft (exam-items.service.ts) проверял
// только статус самого вопроса и не знал о ссылках из exams.blocks[].itemIds —
// удаление вопроса, который стоит в неархивированном экзамене (даже если сам
// вопрос уже откатили в черновик), делало форму несобираемой для ВСЕХ
// учеников сразу: exam-attempt-start.ts не находит вопрос по id.
const REMOVE_MESSAGE = (list: string): string =>
  `Вопрос используется в экзамене: ${list}. Удалить нельзя — сдающие получат ошибку ` +
  '«Вопрос не найден». Уберите вопрос из формы или сначала заархивируйте её.';

// Блокер аудита 2026-09-15 №2: та же дыра для архивации — после неё форму
// нельзя ни сохранить, ни поправить (exam-items-eligible.ts требует
// опубликованный вопрос), а ученики продолжают получать её как есть.
const ARCHIVE_MESSAGE = (list: string): string =>
  `Вопрос используется в экзамене: ${list}. Отправить в архив нельзя — правку или ` +
  'публикацию формы это заблокирует, а ученики продолжат получать её как есть. ' +
  'Сначала уберите вопрос из формы.';

/** Удаление вопроса, на который ссылается неархивированный экзамен, —
 * ConflictError с названиями форм (exam-items.service.ts, remove()). */
export function assertItemNotUsedForRemove(
  examModel: Model<ExamRecord>,
  itemId: string,
): Promise<void> {
  return assertItemNotReferenced(examModel, itemId, REMOVE_MESSAGE);
}

/** Архивация вопроса, на который ссылается неархивированный экзамен, —
 * ConflictError с названиями форм (exam-items.service.ts, update()). */
export function assertItemNotUsedForArchive(
  examModel: Model<ExamRecord>,
  itemId: string,
): Promise<void> {
  return assertItemNotReferenced(examModel, itemId, ARCHIVE_MESSAGE);
}
