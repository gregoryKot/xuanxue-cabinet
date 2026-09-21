// Разделение списка заданий на «новые» (ученик ещё не приступал) и
// остальные — экран «Задания» (TasksScreen.tsx) рисует их под разными
// рубриками. Чистая функция рядом с экраном, а не выражение в JSX (CLAUDE.md
// «Логика вне компонентов», «Тесты»: ветвление проверяется без DOM).
//
// «Новое» — ровно то же самое действие, что уже решает кнопку карточки
// (getMyExamAction === 'start', shared/src/my-exams.ts, ADR-0093): попытки
// не было и лимит не исчерпан. Повтор после дедлайна (`retry`) — не новое
// задание, а старое, которое не успели сдать, поэтому попадает в
// «Остальные» тем же критерием. Один и тот же критерий для кнопки и для
// рубрики не расходится сам с собой на следующей правке экрана.
import { getMyExamAction, type MyExamDto } from '@xuanxue/shared';

export interface SplitTasksResult {
  newTasks: MyExamDto[];
  restTasks: MyExamDto[];
}

export function splitNewTasks(exams: MyExamDto[]): SplitTasksResult {
  const newTasks = exams.filter((exam) => getMyExamAction(exam) === 'start');
  const restTasks = exams.filter((exam) => getMyExamAction(exam) !== 'start');
  return { newTasks, restTasks };
}
