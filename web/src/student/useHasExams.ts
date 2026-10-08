// Есть ли у человека хоть один экзамен — для пункта «Задания» в панели
// (app/navItems.ts, ADR-0178). Читает тот же список, что и MyExamsProvider.tsx,
// второго запроса нет. Без исключения вне провайдера (в отличие от
// useMyExams): панель рисуется и в изолированных тестах. Пока список грузится,
// не пришёл или пуст — `false`: пункт не мигает у тех, кто не учится на курсе.
import { useContext } from 'react';
import { MyExamsContext } from './MyExamsProvider';

export function useHasExams(): boolean {
  const ctx = useContext(MyExamsContext);
  return (ctx?.data?.length ?? 0) > 0;
}
