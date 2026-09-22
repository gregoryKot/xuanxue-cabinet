// Число сданных работ, ждущих проверки, — крупная строка внутри
// карточки-перехода «Проверка» на «Экзаменах» (CLAUDE.md «Продуктовая
// фича = число в своём разделе», exams/ExamsSectionStats.tsx,
// components/SectionLink.tsx, docs/adr/0043): на пустой базе честный текст,
// не «0 работ». Раньше число стояло тёплой плашкой над карточками-переходами
// — рядом с карточкой строки списка экзаменов и карточкой-контуром
// «Проверка» это была третья непохожая на вид поверхность подряд, а сама
// плашка была крупнее заголовков экрана и никуда не вела по клику (отзыв
// владельца со снимком «Экзаменов»). Плашки больше нет: число живёт внутри
// самой карточки «Проверка» и кликабельно вместе с ней (`headline` у
// SectionLink).
//
// `null` — число ещё не пришло (список грузится или упал): тогда крупной
// строки в карточке просто нет, `formatGradingQueueHint` возвращает `null`
// — длинная фраза про «сданные работы» кеглем 22 в этой роли не читалась.
// pluralRu — общий примитив склонения (shared/src/plural-ru.ts), по образцу
// exams/examCounts.ts.
import { pluralRu } from '@xuanxue/shared';

const WORK_FORMS = { one: 'работа', few: 'работы', many: 'работ', other: 'работы' };
const WAIT_VERB_FORMS = { one: 'ждёт', few: 'ждут', many: 'ждут', other: 'ждут' };

export function formatGradingQueueHint(count: number | null): string | null {
  if (count === null) return null;
  if (count === 0) return 'Пока нечего проверять.';
  return (
    `${count} ${pluralRu(count, WORK_FORMS)} ` +
    `${pluralRu(count, WAIT_VERB_FORMS)} проверки.`
  );
}
