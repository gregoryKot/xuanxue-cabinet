import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import {
  CLASSES_LIST_PATH,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  LESSON_RECORDING_SUMMARY_PATH,
  MY_EXAMS_PATH,
  MY_LESSONS_PATH,
  NOTIFICATIONS_FEED_PATH,
  SETTINGS_PATH,
  examsListPath,
  lessonsListPath,
} from '../api/apiPaths';
import { GRADING_QUEUE_PATH, attemptPath } from '../api/gradingPaths';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { MY_LESSON_NOTIFICATIONS_PATH } from '../api/lessonScopePaths';
import { MY_PAYMENTS_PATH, paymentsListPath } from '../api/paymentsApiPaths';
import { MY_BOARD_PATH } from '../api/boardApiPaths';
import { MY_EVENTS_PATH, SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import { firstScreenPaths, prefetchFirstScreen } from './prefetchFirstScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

// Доска ученика (ADR-0173): порядок — как в таблице маршрутов.
const BOARD_PATHS = [
  MY_EXAMS_PATH,
  MY_LESSONS_PATH,
  MY_PAYMENTS_PATH,
  MY_BOARD_PATH,
  MY_EVENTS_PATH,
];
// Доска штата (ADR-0174, дополнение 2026-10-07): штат правит объявление прямо
// с доски и читает настройки школы целиком (`GET /settings`), поэтому
// `/me/board` ему не нужен. Работ, планов и оплат ученика у штата на доске
// нет, а настройки и `/attempts/queue` ученику сервер отклонил бы 403 —
// поэтому наборы разные. События (ADR-0177) делятся так же: штат читает список
// `/events`, ученик — `/me/events`.
const STAFF_BOARD_PATHS = [SETTINGS_PATH, GRADING_QUEUE_PATH, SCHOOL_EVENTS_PATH];

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    noTelegram: false,
    hasEmail: true,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    canUseStudentMode: false,
    homeHiddenTiles: [],
    ...overrides,
  };
}

describe('firstScreenPaths', () => {
  it('учитель на /planning — занятия на окно, классы и число раздела (слой 3.5)', () => {
    expect(firstScreenPaths('/planning', makeMe())).toEqual([
      lessonsListPath(),
      CLASSES_LIST_PATH,
      LESSON_RECORDING_SUMMARY_PATH,
    ]);
  });

  it('учитель на /exams — список экзаменов, очередь проверки и число раздела', () => {
    expect(firstScreenPaths('/exams', makeMe())).toEqual([
      examsListPath({ status: '' }),
      GRADING_QUEUE_PATH,
      EXAM_ITEM_STATS_SUMMARY_PATH,
    ]);
  });

  // Решение владельца 2026-10-06 (ADR-0174, заменяет ADR-0138): «/» у штата
  // ведёт на «Главную» (BOARD_PATH, screenAccess.ts), не на «Экзамены» — гейт от
  // повторного расхождения EMPTY_PATH_FALLBACK (routeMatch.ts) и rootPathFor.
  it('учитель на «/» — данные доски штата: объявление и очередь проверки', () => {
    expect(firstScreenPaths('/', makeMe())).toEqual(STAFF_BOARD_PATHS);
  });

  // ADR-0171: корень бухгалтера — «Оплаты», греем их список без месяца (тот
  // же путь запросит usePayments при монтировании).
  it('бухгалтер на «/» — данные «Оплат»', () => {
    expect(firstScreenPaths('/', makeMe({ roles: ['accountant'] }))).toEqual([
      paymentsListPath(null),
    ]);
  });

  it('админ на /payments — данные «Оплат»', () => {
    expect(firstScreenPaths('/payments', makeMe({ roles: ['admin'] }))).toEqual([
      paymentsListPath(null),
    ]);
  });

  // Учителю оплаты закрыты (canSeeRoute) — греем экран, куда его уведёт
  // редирект, а не запрос, который сервер отклонит.
  it('учитель на /payments — данные доски штата, куда его уведёт редирект', () => {
    expect(firstScreenPaths('/payments', makeMe())).toEqual(
      firstScreenPaths('/board', makeMe()),
    );
  });

  it('учитель на /login — не маршрут кабинета, греть нечего', () => {
    expect(firstScreenPaths('/login', makeMe())).toEqual([]);
  });

  it('учитель на неизвестном адресе — тоже нечего', () => {
    expect(firstScreenPaths('/что-то-неизвестное', makeMe())).toEqual([]);
  });

  // Маршрут штата ученику не открыт (screenAccess.ts, canSeeRoute) — редирект
  // уводит на rootPathFor(me), греем данные экрана-назначения («Главная»),
  // а не расписание учителя.
  it('ученик на /planning (маршрут штата) — данные экрана-назначения «Главная»', () => {
    expect(firstScreenPaths('/planning', makeMe({ roles: [] }))).toEqual(BOARD_PATHS);
  });

  it('ученик на своей «/board» — экзамены, занятия, оплата, объявление и события', () => {
    expect(firstScreenPaths('/board', makeMe({ roles: [] }))).toEqual(BOARD_PATHS);
  });

  // ADR-0174: у штата доска своя — объявление и очередь проверки, без
  // экзаменов, занятий и оплаты ученика; ассистент и админ — как учитель.
  it('учитель, ассистент и админ на «/board» — объявление, очередь проверки и события', () => {
    for (const role of ['teacher', 'assistant', 'admin'] as const) {
      expect(firstScreenPaths('/board', makeMe({ roles: [role] }))).toEqual(
        STAFF_BOARD_PATHS,
      );
    }
  });

  // Карточка оплаты — только ученику (isPaymentContactVisible), очередь
  // проверки — только штату (ученику сервер ответил бы 403): штат в режиме
  // ученика получает доску ученика без оплаты и без очереди.
  it('штат в режиме ученика на «/board» — без оплаты, очереди проверки и списка событий штата', () => {
    expect(firstScreenPaths('/board', makeMe({ roles: [], studentMode: true }))).toEqual([
      MY_EXAMS_PATH,
      MY_LESSONS_PATH,
      MY_BOARD_PATH,
      MY_EVENTS_PATH,
    ]);
  });

  // ADR-0179: скрытую плитку экран не запросит — греть её нечего. Экзамены
  // греются всегда: от них зависит пункт «Задания» в панели.
  it('ученик скрыл оплату, событие и занятие — их пути не греются, экзамены остаются', () => {
    const me = makeMe({
      roles: [],
      homeHiddenTiles: ['payment', 'events', 'nextLesson'],
    });

    expect(firstScreenPaths('/board', me)).toEqual([MY_EXAMS_PATH, MY_BOARD_PATH]);
  });

  it('ученик скрыл экзамены — путь экзаменов всё равно греется', () => {
    const me = makeMe({ roles: [], homeHiddenTiles: ['exams'] });

    expect(firstScreenPaths('/board', me)).toEqual(BOARD_PATHS);
  });

  it('штат скрыл проверку — очередь не греется, настройки и события остаются', () => {
    const me = makeMe({ homeHiddenTiles: ['grading'] });

    expect(firstScreenPaths('/board', me)).toEqual([SETTINGS_PATH, SCHOOL_EVENTS_PATH]);
  });

  it('скрытое не мешает другим экранам: «/tasks» греет экзамены как обычно', () => {
    const me = makeMe({ roles: [], homeHiddenTiles: ['exams', 'payment'] });

    expect(firstScreenPaths('/tasks', me)).toEqual([MY_EXAMS_PATH]);
  });

  it('ученик на своём «/tasks» — список экзаменов', () => {
    expect(firstScreenPaths('/tasks', makeMe({ roles: [] }))).toEqual([MY_EXAMS_PATH]);
  });

  it('ученик на своём «/lessons» — список занятий', () => {
    expect(firstScreenPaths('/lessons', makeMe({ roles: [] }))).toEqual([
      MY_LESSONS_PATH,
    ]);
  });

  it('ученик на /attempts/:id — общий для всех ролей маршрут сдачи (ADR-0126)', () => {
    expect(firstScreenPaths('/attempts/1', makeMe({ roles: [] }))).toEqual([
      attemptPath('1'),
    ]);
  });

  it('ученик на /profile — общий для всех ролей маршрут (ADR-0045), греть нечего (ADR-0162)', () => {
    expect(firstScreenPaths('/profile', makeMe({ roles: [] }))).toEqual([]);
  });

  it('ученик на /notifications/settings — греются виды уведомлений и занятия для выбора', () => {
    expect(firstScreenPaths('/notifications/settings', makeMe({ roles: [] }))).toEqual([
      '/me/notifications',
      MY_LESSON_NOTIFICATIONS_PATH,
    ]);
  });

  // Блок «О каких занятиях» у штата не рисуется (у него нет вида про занятие,
  // ADR-0162) — промис за занятиями остался бы в prefetchCache, забрать его
  // было бы некому.
  it('штат на /notifications/settings — греются только виды уведомлений, без занятий', () => {
    for (const role of ['teacher', 'assistant', 'admin', 'accountant'] as const) {
      expect(
        firstScreenPaths('/notifications/settings', makeMe({ roles: [role] })),
      ).toEqual(['/me/notifications']);
    }
  });

  // Новые задания считаются только у ученика (ADR-0074): у штата школы
  // попыток нет, поэтому этот прогрев не ходит в /me/exams — промис остался
  // бы в prefetchCache, забрать его было бы некому. То же с занятиями для
  // подсказки «выберите свои занятия» (ADR-0162, п. 5): у штата вида про
  // занятие нет, и лента за ними не пойдёт (LessonScopeHint.tsx).
  it('штат школы на /notifications — греется только лента, без /me/exams и занятий', () => {
    expect(firstScreenPaths('/notifications', makeMe({ roles: ['teacher'] }))).toEqual([
      NOTIFICATIONS_FEED_PATH,
    ]);
    expect(firstScreenPaths('/notifications', makeMe({ roles: ['assistant'] }))).toEqual([
      NOTIFICATIONS_FEED_PATH,
    ]);
    expect(firstScreenPaths('/notifications', makeMe({ roles: ['admin'] }))).toEqual([
      NOTIFICATIONS_FEED_PATH,
    ]);
  });

  it('ученик на /notifications — греются лента, формы и занятия для подсказки', () => {
    expect(firstScreenPaths('/notifications', makeMe({ roles: [] }))).toEqual([
      NOTIFICATIONS_FEED_PATH,
      MY_EXAMS_PATH,
      MY_LESSON_NOTIFICATIONS_PATH,
    ]);
  });

  // Сужение из теста выше — только для /notifications. На /tasks маршрут
  // открыт любой роли (screenAccess.ts, canSeeRoute), а TasksScreen зовёт
  // useMyExams() без оглядки на роль — прогрев обязан догонять экран для
  // всех, иначе учащийся-ассистент ждёт формы лишний TTFB.
  it('штат школы на /tasks — формы всё равно греются', () => {
    expect(firstScreenPaths('/tasks', makeMe())).toEqual([MY_EXAMS_PATH]);
  });
});

describe('prefetchFirstScreen', () => {
  it('кладёт промис apiFetch на каждый путь', () => {
    mockedApiFetch.mockResolvedValue([]);

    prefetchFirstScreen('/planning', makeMe());

    expect(mockedApiFetch).toHaveBeenCalledTimes(3);
    expect(mockedApiFetch).toHaveBeenCalledWith(lessonsListPath());
    expect(mockedApiFetch).toHaveBeenCalledWith(CLASSES_LIST_PATH);
    expect(mockedApiFetch).toHaveBeenCalledWith(LESSON_RECORDING_SUMMARY_PATH);
  });
});
