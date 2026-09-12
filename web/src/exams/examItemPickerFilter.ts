// Кандидаты в блок формы — только опубликованные вопросы банка, по тегу
// (частичное совпадение без регистра — живой локальный фильтр списка, уже
// загруженного целиком, а не отдельный запрос на каждую букву; ТЗ 4.3
// «список опубликованных вопросов банка с фильтром по тегу»).
import type { ExamItemDto } from '@xuanxue/shared';

export function filterPickerCandidates(items: ExamItemDto[], tag: string): ExamItemDto[] {
  const needle = tag.trim().toLowerCase();
  return items.filter((item) => {
    if (item.status !== 'published') return false;
    if (needle === '') return true;
    return item.tags.some((t) => t.toLowerCase().includes(needle));
  });
}
