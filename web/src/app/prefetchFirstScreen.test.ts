import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { ATTEMPTS_LIST_PATH, CLASSES_LIST_PATH, lessonsListPath } from '../api/apiPaths';
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

  it('ученик на /planning — свои занятия и экзамены, не расписание учителя', () => {
    expect(firstScreenPaths('/planning', makeMe({ roles: [] }))).toEqual([
      '/me/lessons',
      '/me/exams',
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
