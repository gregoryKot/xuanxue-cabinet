// Кандидаты в блок формы — опубликованные вопросы банка, по тегу (частичное
// совпадение без регистра — живой локальный фильтр списка, уже загруженного
// целиком, а не отдельный запрос на каждую букву; ТЗ 4.3 «список
// опубликованных вопросов банка с фильтром по тегу»). Черновики банка под тем
// же фильтром — отдельная выборка для приглушённой группы под списком
// кандидатов (ExamItemPickerDrafts.tsx): учитель их видит, но в форму они не
// попадают (баг с прода: учитель завёл вопрос на «Вопросах» и не нашёл его в
// конструкторе, потому что новый вопрос — всегда черновик, ExamItemRecord).
import type { ExamItemDto, ExamItemStatus } from '@xuanxue/shared';

function matchesTag(item: ExamItemDto, needle: string): boolean {
  if (needle === '') return true;
  return item.tags.some((t) => t.toLowerCase().includes(needle));
}

function filterByStatusAndTag(
  items: ExamItemDto[],
  tag: string,
  status: ExamItemStatus,
): ExamItemDto[] {
  const needle = tag.trim().toLowerCase();
  return items.filter((item) => item.status === status && matchesTag(item, needle));
}

export function filterPickerCandidates(items: ExamItemDto[], tag: string): ExamItemDto[] {
  return filterByStatusAndTag(items, tag, 'published');
}

export function filterPickerDrafts(items: ExamItemDto[], tag: string): ExamItemDto[] {
  return filterByStatusAndTag(items, tag, 'draft');
}
