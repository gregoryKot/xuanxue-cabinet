// Глубокая ссылка из уведомления «Новое задание» — `/tasks?start=<examId>`
// (NewTaskCard.tsx, ADR-0129): один клик в центре уведомлений обязан сразу
// открыть тот же вопрос «Вы начинаете экзамен» (форма с лимитом времени) или
// сразу стартовать (форма без лимита), не список, который ученику пришлось
// бы листать заново в поисках той же карточки.
//
// Отдельный хук, не код внутри TasksScreen.tsx (CLAUDE.md «Логика вне
// компонентов», лимит размера экрана): один вызов уже знакомого `start(exam)`
// из useTaskStart.ts — вторая реализация того же действия здесь стала бы
// второй реализацией одного ввода.
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMyExamAction, type MyExamAction, type MyExamDto } from '@xuanxue/shared';

const START_PARAM = 'start';
// 'start'/'retry' — тот же вопрос, что у кнопки «Начать»/«Пройти ещё раз»;
// 'continue' — start() сам откроет уже идущую попытку без вопроса
// (resolveTaskStartTarget.ts). Экзамен с action null (попытки исчерпаны) —
// нажимать нечего, ссылка просто открывает список.
const STARTABLE_ACTIONS: ReadonlySet<MyExamAction> = new Set([
  'start',
  'retry',
  'continue',
]);

/** `exams` — `null`, пока список не загружен: хук ждёт первого непустого
 * ответа и не трогает URL раньше — иначе параметр `start` слетел бы до того,
 * как экзамен вообще нашёлся. */
export function useStartFromLink(
  exams: MyExamDto[] | null,
  start: (exam: MyExamDto) => void,
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const examId = searchParams.get(START_PARAM);
  // Один раз на конкретный examId — без этого повторный рендер после
  // start() (список пришёл ответом POST, applyAttempt) открывал бы диалог
  // заново, хотя ученик уже успел его закрыть «Не сейчас».
  const handledExamId = useRef<string | null>(null);

  useEffect(() => {
    if (!examId || exams === null || handledExamId.current === examId) return;
    handledExamId.current = examId;

    const exam = exams.find((e) => e.id === examId);
    if (exam && STARTABLE_ACTIONS.has(getMyExamAction(exam))) start(exam);

    // Функция-колбэк мутирует и возвращает переданный `prev` (та же форма,
    // что в примере react-router) — второй `URLSearchParams` не заводим.
    setSearchParams(
      (prev) => {
        prev.delete(START_PARAM);
        return prev;
      },
      { replace: true },
    );
  }, [examId, exams, start, setSearchParams]);
}
