// Вопросы банка, заведённые до ADR-0033, остались черновиками: тогда новый
// вопрос создавался как `draft` и его надо было отдельно опубликовать, иначе
// конструктор экзамена его не предлагал. Владелец завёл вопросы и не нашёл их
// в форме — шаг оказался лишним, дефолт стал `published`
// (exam-item.schema.ts). Без этой миграции уже заведённые вопросы так и
// остались бы невидимыми для конструктора.
//
// `status` — plain-поле политики EXAM_ITEM_FIELD_POLICY (exam-item.schema.ts):
// перечисление для выборок, не шифруется — миграция обходится без ключа.
// Идемпотентна по построению: второй запуск не найдёт ни одного `draft`.
//
// Архивные и уже опубликованные не трогаем: архив — осознанное «убрано из
// оборота», а не забытый черновик.
import type { Db } from 'mongodb';

const EXAM_ITEMS = 'exam_items';

export const examItemsPublishedByDefault = {
  id: '0006-exam-items-published-by-default',
  async up(db: Db): Promise<void> {
    await db
      .collection(EXAM_ITEMS)
      .updateMany(
        { status: 'draft' },
        { $set: { status: 'published', updatedAt: new Date() } },
      );
  },
};
