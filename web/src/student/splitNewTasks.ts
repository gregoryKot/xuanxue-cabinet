// Разделение списка заданий на «новые» (ученик ещё не приступал) и
// остальные — экран «Задания» (TasksScreen.tsx) рисует их под разными
// рубриками. Чистая функция рядом с экраном, а не выражение в JSX (CLAUDE.md
// «Логика вне компонентов», «Тесты»: ветвление проверяется без DOM).
//
// «Новое» — ровно то же самое действие, что уже решает карточку кнопки
// (getExamAction === 'start'): попытки не было и лимит не исчерпан. Один и
// тот же критерий для кнопки и для рубрики не расходится сам с собой на
// следующей правке экрана.
import type { MyExamDto } from '@xuanxue/shared';
import { getExamAction } from './examAttemptState';

export interface SplitTasksResult {
  newTasks: MyExamDto[];
  restTasks: MyExamDto[];
}

export function splitNewTasks(exams: MyExamDto[]): SplitTasksResult {
  const newTasks = exams.filter((exam) => getExamAction(exam) === 'start');
  const restTasks = exams.filter((exam) => getExamAction(exam) !== 'start');
  return { newTasks, restTasks };
}
