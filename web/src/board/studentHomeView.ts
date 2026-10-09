// Что показать на главной ученика (ADR-0178): чистая функция по состоянию пяти
// запросов. Правило одно — плитка есть, только когда есть о чём сказать:
// ближайшее занятие, объявление, экзамены к сдаче, оплата за месяц, события.
// Плитку, которую человек скрыл у себя (`hidden`, ADR-0179), функция не отдаёт
// и не ждёт её источник: скелетон не должен держаться ради невидимого.
// Нет экзамена к сдаче — ни плитки, ни фразы «экзаменов нет»: человек, который
// пришёл за расписанием и архивом, не учится на курсе, и слово «экзамен» ему
// ни к чему. Так же с занятиями. Компонент (StudentBoard.tsx) только рисует
// то, что вернула эта функция.
//
// Пока хоть один запрос идёт в первый раз, показывать нечего решить: один
// скелетон на всё, потом сразу плитки — иначе плитки выскакивали бы по одной и
// двигали друг друга (`firstLoadDone`, его держит useStudentHome.ts). Сбой
// запроса не гасит остальные плитки: у источника остаётся своя ошибка с
// повтором, а фразу «ничего не ждут» при сбое не пишем — это была бы
// неправда о том, чего мы не смогли узнать.
import type {
  BoardNotice,
  HomeTileKey,
  MyBoardDto,
  MyExamDto,
  MyLessonDto,
  MyPaymentsPageDto,
  SchoolEventDto,
} from '@xuanxue/shared';
import { splitTasksToDo } from '../student/splitTasksToDo';
import { boardPaymentView, type BoardPaymentView } from './boardPaymentView';
import { hasHiddenOwnTile } from './homeTileOptions';
import { SOURCE_TILE, type HomeSource } from './homeSourceTile';

/** Состояние одного запроса — то, что отдаёт useAbortableFetch. */
export interface SourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface StudentHomeInput {
  board: SourceState<MyBoardDto>;
  exams: SourceState<MyExamDto[]>;
  /** Оплату за запросом не ждём, когда карточка человеку не положена
   * (`paymentVisible: false`, isPaymentContactVisible). */
  payments: SourceState<MyPaymentsPageDto>;
  paymentVisible: boolean;
  events: SourceState<SchoolEventDto[]>;
  lessons: SourceState<MyLessonDto[]>;
  /** Первая загрузка всех источников кончилась (хотя бы раз). */
  firstLoadDone: boolean;
  /** Плитки, скрытые человеком (`MeDto.homeHiddenTiles`, ADR-0179). */
  hidden: readonly HomeTileKey[];
}

export interface StudentHomeView {
  /** `loading` — скелетон; `empty` — спокойная строка; `ready` — плитки. */
  status: 'loading' | 'empty' | 'ready';
  notice: BoardNotice | null;
  toDo: MyExamDto[];
  payment: BoardPaymentView | null;
  events: SchoolEventDto[];
  nextLesson: MyLessonDto | null;
  /** Тексты сбоев по источникам: баннер с повтором стоит на месте плитки. */
  errors: Partial<Record<HomeSource, string>>;
  /** Человек сам скрыл хотя бы одну из этих плиток: пустой экран объяснит, как
   * их вернуть (ADR-0179). */
  hasHidden: boolean;
}

/** Идёт ли у источника первая загрузка. Повтор после сбоя тоже даёт
 * `loading` без данных, поэтому отличать первую загрузку от повтора
 * приходится защёлкой `firstLoadDone`, а не самим состоянием. */
function isSourceLoading(state: SourceState<unknown>): boolean {
  return state.loading && state.data === null && state.error === null;
}

export function isHomeLoading(input: StudentHomeInput): boolean {
  const states: [HomeSource, SourceState<unknown>][] = [
    ['board', input.board],
    ['exams', input.exams],
    ['events', input.events],
    ['lessons', input.lessons],
  ];
  if (input.paymentVisible) states.push(['payments', input.payments]);
  return states.some(
    ([source, state]) =>
      !input.hidden.includes(SOURCE_TILE[source]) && isSourceLoading(state),
  );
}

/** Источник, которого нет: оплата тому, кому карточка не положена. */
const emptySource: SourceState<unknown> = { data: null, loading: false, error: null };

export function buildStudentHome(input: StudentHomeInput): StudentHomeView {
  const { board, exams, payments, events, lessons, hidden } = input;
  const isShown = (tile: HomeTileKey) => !hidden.includes(tile);

  // Сбой источника, чья плитка скрыта, не показываем: баннер стоял бы на месте
  // плитки, которой человек не просил. Экзамены запрашиваются всегда (пункт
  // «Задания» в панели, ADR-0178), поэтому их сбой скрытая плитка гасит тоже.
  const errors: StudentHomeView['errors'] = {};
  const sources: [HomeSource, SourceState<unknown>][] = [
    ['board', board],
    ['exams', exams],
    ['payments', input.paymentVisible ? payments : emptySource],
    ['events', events],
    ['lessons', lessons],
  ];
  for (const [key, state] of sources) {
    if (state.error && isShown(SOURCE_TILE[key])) errors[key] = state.error;
  }

  const notice = isShown('notice') ? (board.data?.notice ?? null) : null;
  const toDo = isShown('exams') && exams.data ? splitTasksToDo(exams.data).toDo : [];
  const payment =
    isShown('payment') && input.paymentVisible && payments.data
      ? boardPaymentView(payments.data)
      : null;
  const eventList = isShown('events') ? (events.data ?? []) : [];
  // `/me/lessons` отдаёт список по возрастанию startsAt (MyLessonsService):
  // ближайшее — первое, без пересортировки.
  const nextLesson = isShown('nextLesson') ? (lessons.data?.[0] ?? null) : null;

  const hasTiles =
    notice !== null ||
    toDo.length > 0 ||
    payment !== null ||
    eventList.length > 0 ||
    nextLesson !== null;
  const hasErrors = Object.keys(errors).length > 0;

  let status: StudentHomeView['status'] = 'ready';
  if (!input.firstLoadDone && isHomeLoading(input)) status = 'loading';
  else if (!hasTiles && !hasErrors) status = 'empty';

  return {
    status,
    notice,
    toDo,
    payment,
    events: eventList,
    nextLesson,
    errors,
    hasHidden: hasHiddenOwnTile(hidden, false),
  };
}
