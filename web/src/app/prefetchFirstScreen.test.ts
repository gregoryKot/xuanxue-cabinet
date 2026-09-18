import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import {
  ATTEMPTS_LIST_PATH,
  CLASSES_LIST_PATH,
  MY_EXAMS_PATH,
  MY_LESSONS_PATH,
  lessonsListPath,
} from '../api/apiPaths';
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
    tz: 'Asia/Jerusalem',
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    needsProfile: false,
    ...overrides,
  };
}

describe('firstScreenPaths', () => {
  it('учитель на /planning — занятия на окно и классы', () => {
    expect(firstScreenPaths('/planning', makeMe())).toEqual([
      lessonsListPath(),
      CLASSES_LIST_PATH,
    ]);
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
    expect(firstScreenPaths('/planning', makeMe({ roles: [] }))).toEqual([
      MY_EXAMS_PATH,
    ]);
  });

  it('ученик на своём «/tasks» — список экзаменов', () => {
    expect(firstScreenPaths('/tasks', makeMe({ roles: [] }))).toEqual([MY_EXAMS_PATH]);
  });

  it('ученик на своём «/lessons» — список занятий', () => {
    expect(firstScreenPaths('/lessons', makeMe({ roles: [] }))).toEqual([
      MY_LESSONS_PATH,
    ]);
  });

  it('ученик на /attempts/:id — общий для всех ролей маршрут сдачи (ТЗ student-exams.md)', () => {
    expect(firstScreenPaths('/attempts/1', makeMe({ roles: [] }))).toEqual([
      ATTEMPTS_LIST_PATH,
    ]);
  });

  it('ученик на /profile — общий для всех ролей маршрут (ADR-0045)', () => {
    expect(firstScreenPaths('/profile', makeMe({ roles: [] }))).toEqual([
      '/me/notifications',
    ]);
  });
});

describe('prefetchFirstScreen', () => {
  it('кладёт промис apiFetch на каждый путь', () => {
    mockedApiFetch.mockResolvedValue([]);

    prefetchFirstScreen('/planning', makeMe());

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(mockedApiFetch).toHaveBeenCalledWith(lessonsListPath());
    expect(mockedApiFetch).toHaveBeenCalledWith(CLASSES_LIST_PATH);
  });
});
