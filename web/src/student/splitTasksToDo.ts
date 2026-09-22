// Деление списка заданий на то, что ждёт ученика сейчас, и то, что уже
// позади — экран «Задания» (TasksScreen.tsx) рисует две группы под своими
// рубриками. Чистая функция рядом с экраном, а не выражение в JSX (CLAUDE.md
// «Логика вне компонентов»: ветвление проверяется без DOM).
//
// Отзыв владельца 2026-09-22: в списке вперемешку лежали живые и законченные
// экзамены, и за пять секунд было не понять, что сдавать. Прежнее деление
// (splitNewTasks.ts, удалён вместе с тестом) резало по другому шву — «ещё не
// приступал» против «всё остальное», — и сданная работа, законченная форма и
// возвращённая на доработку лежали в одной куче «Остальные».
//
// Граница — кнопка карточки, то есть общее для кабинета и бота
// `getMyExamAction` (shared/src/my-exams.ts, ADR-0091): нечего нажимать —
// делать нечего. Одно исключение, и оно про сданный экзамен: после «Экзамен
// сдан» кнопка «Пройти ещё раз» остаётся (учитель лимит попыток не съел), но
// школа ученика не ждёт — такая карточка уезжает к законченным, иначе
// рубрика «Сдавать сейчас» звала бы пересдавать уже сданное (ADR-0120).
import { getMyExamAction, type MyExamDto } from '@xuanxue/shared';

export interface TasksSplit {
  /** Ждут действия ученика: начать, продолжить, пройти ещё раз. */
  toDo: MyExamDto[];
  /** Делать нечего: работа у учителя, экзамен сдан, попытки кончились. */
  done: MyExamDto[];
}

function isWaitingForStudent(exam: MyExamDto): boolean {
  if (getMyExamAction(exam) === null) return false;
  const attempt = exam.lastAttempt;
  return attempt?.outcome !== 'passed';
}

export function splitTasksToDo(exams: MyExamDto[]): TasksSplit {
  const toDo = exams.filter(isWaitingForStudent);
  const done = exams.filter((exam) => !isWaitingForStudent(exam));
  return { toDo, done };
}
