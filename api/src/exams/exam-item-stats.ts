// Чистая логика статистики вопроса (ТЗ 4.8) — без похода в базу, юнит-тест
// без Mongo (CLAUDE.md «Тесты»). «Ответили верно» считается по данным снимка
// попытки (накопитель — exam-item-stats-accumulate.ts), а не по сегодняшней
// редакции вопроса банка — иначе правка ответа задним числом переписывала бы
// то, что уже произошло (ADR-0022). Список вариантов для показа учителю,
// наоборот, строится из текущего вопроса банка: учителю нужно решать, что
// делать с вопросом сегодня.
//
// Выборы считаются по `id` варианта. Правка текста варианта на месте `id`
// сохраняет (редактор присылает его обратно, mapOptions) — выборы честно
// остаются у той же строки, это осознанно. А вот вариант, который заменили
// или удалили (нового `id` в текущей редакции нет), раньше из статистики
// пропадал вместе со всеми, кто его выбирал: askedCount их считал, суммы по
// вариантам — нет (аудит 2026-10-01, F62). Теперь такие `id` дописываются
// отдельными строками с пометкой `removed` и текстом из истории редакций.
import type { ExamItemKind, ExamItemStatsDto } from '@xuanxue/shared';
import {
  emptyAccumulator,
  type ItemStatsAccumulator,
} from './exam-item-stats-accumulate';
import type { ExamItemOptionRecord } from './exam-item.schema';

// Не отдельный именованный экспорт из shared/src/index.ts (единственный
// файл-баррель проекта и так растёт с каждым слоем, CLAUDE.md «Файлы») — тип
// варианта выводится из формы `ExamItemStatsDto.options`, один источник
// вместо двух.
type ExamItemOptionStatsDto = NonNullable<ExamItemStatsDto['options']>[number];

/** Сегодняшний вопрос банка — то, что нужно статистике из `ExamItemDto`
 * (структурно совместим, сервис передаёт DTO как есть). `history` — прошлые
 * редакции, новейшая первой (exam-items.service.ts), только ради текста
 * варианта, которого больше нет (F62). */
export interface ItemStatsSource {
  id: string;
  kind: ExamItemKind;
  options: readonly ExamItemOptionRecord[];
  history?: readonly { options: readonly ExamItemOptionRecord[] }[];
  // ADR-0146: сегодняшний флаг вопроса, не запись из снимка попытки.
  askReason?: boolean;
}

function toOptionStats(
  option: ExamItemOptionRecord,
  chosenCount: number,
): ExamItemOptionStatsDto {
  return {
    id: option.id,
    text: option.text,
    correct: option.correct,
    chosenCount,
    // Ключа нет вовсе, если картинки не было (ADR-0035) — строка
    // статистики без подписи иначе не с чем сопоставить на экране.
    ...(option.imageId !== undefined ? { imageId: option.imageId } : {}),
  };
}

/** Строки по вариантам, которые выбирали, но которых в текущей редакции нет
 * (F62): текст и отметка «верно» — из ближайшей прошлой редакции, где
 * вариант ещё был; не нашлось (история обрезана) — пустой текст, экран
 * подпишет «Вариант N» сам (formatOptionLabel). Порядок — по первому
 * появлению в попытках, после текущих вариантов. */
function removedOptionStats(
  item: ItemStatsSource,
  chosenById: ReadonlyMap<string, number>,
): ExamItemOptionStatsDto[] {
  const currentIds = new Set(item.options.map((option) => option.id));
  const pastOptions = (item.history ?? []).flatMap((version) => version.options);
  const rows: ExamItemOptionStatsDto[] = [];
  for (const [id, chosenCount] of chosenById) {
    if (currentIds.has(id)) continue;
    const past = pastOptions.find((option) => option.id === id);
    const option = past ?? { id, text: '', correct: false };
    rows.push({ ...toOptionStats(option, chosenCount), removed: true });
  }
  return rows;
}

/** Статистика одного вопроса — варианты из сегодняшнего вопроса банка (не
 * из снимков попыток, см. комментарий в начале файла) плюс строки удалённых
 * вариантов. Без `usedInExamsCount`: отдельный запрос к базе добавляет его
 * сам вызывающий (exam-item-references.ts, ExamItemStatsService.getStats). */
export function computeExamItemStats(
  item: ItemStatsSource,
  accByItem: ReadonlyMap<string, ItemStatsAccumulator>,
): Omit<ExamItemStatsDto, 'usedInExamsCount'> {
  const acc = accByItem.get(item.id) ?? emptyAccumulator();
  const hasOptions = item.options.length > 0;
  const showReason = hasOptions && (item.askReason ?? false);
  const options: ExamItemOptionStatsDto[] | undefined = hasOptions
    ? [
        ...item.options.map((option) =>
          toOptionStats(option, acc.chosenById.get(option.id) ?? 0),
        ),
        ...removedOptionStats(item, acc.chosenById),
      ]
    : undefined;

  return {
    itemId: item.id,
    kind: item.kind,
    askedCount: acc.askedCount,
    correctCount: hasOptions ? acc.correctCount : undefined,
    correctRate:
      hasOptions && acc.askedCount > 0 ? acc.correctCount / acc.askedCount : undefined,
    options,
    reasonCount: showReason ? acc.reason.reasonGivenCount : undefined,
    reasonAnsweredCount: showReason ? acc.reason.optionChosenCount : undefined,
  };
}

/** Сколько заданных вопросов с вариантами отвечают верно реже половины
 * случаев (строго меньше 0.5). Число для карточки-ссылки «Вопросы»
 * (shared/src/exam-item-stats.ts, `ExamItemStatsSummaryDto`). */
export function computeStrugglingCount(
  items: readonly { id: string; options: readonly ExamItemOptionRecord[] }[],
  accByItem: ReadonlyMap<string, ItemStatsAccumulator>,
): number {
  let count = 0;
  for (const item of items) {
    if (item.options.length === 0) continue;
    const acc = accByItem.get(item.id);
    if (!acc || acc.askedCount === 0) continue;
    if (acc.correctCount / acc.askedCount < 0.5) count += 1;
  }
  return count;
}
