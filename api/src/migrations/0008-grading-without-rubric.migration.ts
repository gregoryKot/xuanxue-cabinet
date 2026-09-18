// Механика «рубрика» — критерии проверки с баллами 0..N — удалена с концами
// (решение владельца 2026-09-17, ADR-0038): критерии по
// умолчанию (DEFAULT_RUBRIC) были выдуманы агентом, а не написаны со слов
// учителя, а экран, где их можно было бы переписать под себя, так и не
// появился — настройка, которую нельзя поменять в интерфейсе, нарушает
// CLAUDE.md «Кабинет учителя: всё настраивается в интерфейсе». Проверка
// остаётся: итог (outcome) и общий комментарий учителя переводят попытку в
// graded и уходят ученику, снимаются только баллы и критерии рубрики.
//
// `exams.rubric` и `exam_gradings.criteria` хранились строкой целиком
// (encJson, exam.schema.ts/exam-grading.schema.ts) — $unset снимает поле
// как есть, расшифровка не нужна. В `criteria` лежали в том числе
// комментарии учителя по каждому критерию конкретного ученика — это
// персональные данные, которым незачем жить дальше без самой механики
// (CLAUDE.md «Персональные данные учеников — минимум и срок»).
//
// Идемпотентна по построению — фильтр на `$exists`, второй запуск не
// находит ни одного документа с полем.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const EXAMS = 'exams';
const EXAM_GRADINGS = 'exam_gradings';

export const gradingWithoutRubric = {
  id: '0008-grading-without-rubric',
  async up(db: Db): Promise<void> {
    await db
      .collection(EXAMS)
      .updateMany({ rubric: { $exists: true } }, { $unset: { rubric: '' } });
    await db
      .collection(EXAM_GRADINGS)
      .updateMany({ criteria: { $exists: true } }, { $unset: { criteria: '' } });
  },
};
