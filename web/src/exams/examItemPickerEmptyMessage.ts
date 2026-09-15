// Текст пустого списка кандидатов пикера — чистый форматтер с тестом
// (CLAUDE.md «Продуктовая фича = число в своём разделе»: на пустых данных —
// честный текст, не молчание). Различает три случая: опубликованных вопросов
// нет совсем и черновиков тоже нет (банк правда пуст); опубликованных нет, но
// черновики есть — баг с прода, учитель завёл вопросы, а пикер написал
// «вопросов пока нет», хотя они лежат черновиками ниже; фильтр по тегу не
// нашёл ничего среди опубликованных, хотя опубликованные вопросы в банке
// есть.
import { pluralRu } from '@xuanxue/shared';

const NO_PUBLISHED_MESSAGE =
  'Опубликованных вопросов пока нет. Добавьте и опубликуйте их на «Вопросах для экзамена».';
const NO_MATCH_MESSAGE = 'По этому тегу опубликованных вопросов нет.';

const DRAFT_FORMS = {
  one: 'черновик',
  few: 'черновика',
  many: 'черновиков',
  other: 'черновика',
};
const WAIT_VERB_FORMS = { one: 'ждёт', few: 'ждут', many: 'ждут', other: 'ждут' };

export function formatNoPublishedMessage(
  hasAnyPublished: boolean,
  draftsTotal: number,
): string {
  if (hasAnyPublished) return NO_MATCH_MESSAGE;
  if (draftsTotal > 0) {
    return (
      `Опубликованных вопросов нет: ${draftsTotal} ${pluralRu(draftsTotal, DRAFT_FORMS)} ` +
      `${pluralRu(draftsTotal, WAIT_VERB_FORMS)} публикации ниже. Опубликуйте — и они ` +
      'попадут в форму.'
    );
  }
  return NO_PUBLISHED_MESSAGE;
}
