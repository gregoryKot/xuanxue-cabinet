import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import {
  CLASSES_LIST_PATH,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  GRADING_QUEUE_PATH,
  LESSON_RECORDING_SUMMARY_PATH,
  MY_EXAMS_PATH,
  MY_LESSONS_PATH,
  NOTIFICATIONS_FEED_PATH,
  attemptPath,
  examsListPath,
  lessonsListPath,
} from '../api/apiPaths';
import { paymentsListPath } from '../api/paymentsApiPaths';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { firstScreenPaths, prefetchFirstScreen } from './prefetchFirstScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

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

  // Решение владельца 2026-09-27 (ADR-0138): «/» у штата ведёт на «Экзамены»
  // (STAFF_ROOT_PATH), не на «Занятия» — гейт от повторного расхождения
  // EMPTY_PATH_FALLBACK (routeMatch.ts) и STAFF_ROOT_PATH (screenAccess.ts).
  it('учитель на «/» — данные «Экзаменов», не «Занятий»', () => {
    expect(firstScreenPaths('/', makeMe())).toEqual([
      examsListPath({ status: '' }),
      GRADING_QUEUE_PATH,
      EXAM_ITEM_STATS_SUMMARY_PATH,
    ]);
  });

  // ADR-0150: корень бухгалтера — «Оплаты», греем их список без месяца (тот
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
  it('учитель на /payments — данные «Экзаменов», куда его уведёт редирект', () => {
    expect(firstScreenPaths('/payments', makeMe())).toEqual(
      firstScreenPaths('/exams', makeMe()),
    );
  });

  it('учитель на /login — не маршрут кабинета, греть нечего', () => {
    expect(firstScreenPaths('/login', makeMe())).toEqual([]);
  });

  it('учитель на неизвестном адресе — тоже нечего', () => {
    expect(firstScreenPaths('/что-то-неизвестное', makeMe())).toEqual([]);
  });

  // Маршрут штата ученику не открыт (screenAccess.ts, canSeeRoute) — редирект
  // уводит на rootPathFor(me), греем данные экрана-назначения («Задания»),
  // а не расписание учителя.
  it('ученик на /planning (маршрут штата) — данные экрана-назначения «Задания»', () => {
    expect(firstScreenPaths('/planning', makeMe({ roles: [] }))).toEqual([MY_EXAMS_PATH]);
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

  it('ученик на /profile — общий для всех ролей маршрут (ADR-0045)', () => {
    expect(firstScreenPaths('/profile', makeMe({ roles: [] }))).toEqual([
      '/me/notifications',
    ]);
  });

  // Новые задания считаются только у ученика (ADR-0074): у штата школы
  // попыток нет, поэтому этот прогрев не ходит в /me/exams — промис остался
  // бы в prefetchCache, забрать его было бы некому.
  it('штат школы на /notifications — греется только лента, без /me/exams', () => {
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

  it('ученик на /notifications — греется лента и формы, как раньше', () => {
    expect(firstScreenPaths('/notifications', makeMe({ roles: [] }))).toEqual([
      NOTIFICATIONS_FEED_PATH,
      MY_EXAMS_PATH,
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
