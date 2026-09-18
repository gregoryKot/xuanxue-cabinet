// Хук стартует предзагрузку один раз, сразу после первого ответа /auth/me —
// не на каждый refresh() (см. комментарий-«почему» в FirstScreenPrefetch.tsx).
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { CLASSES_LIST_PATH, lessonsListPath } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { FirstScreenPrefetch } from './FirstScreenPrefetch';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  needsProfile: false,
};

/** Даёт тесту доступ к `refresh()` контекста — без своего экрана незачем
 * заводить отдельный компонент-обвязку под один вызов. */
function RefreshProbe({ onReady }: { onReady: (refresh: () => Promise<void>) => void }) {
  const { refresh } = useAuth();
  onReady(refresh);
  return null;
}

function countCallsTo(path: string): number {
  return mockedApiFetch.mock.calls.filter(([called]) => called === path).length;
}

describe('FirstScreenPrefetch', () => {
  it('после первого /auth/me греет занятия и классы ровно по разу, повторный refresh() не греет снова', async () => {
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/me' ? Promise.resolve(TEACHER) : Promise.resolve([]),
    );
    let refresh: (() => Promise<void>) | undefined;

    render(
      <MemoryRouter initialEntries={['/planning']}>
        <AuthProvider>
          <FirstScreenPrefetch />
          <RefreshProbe onReady={(fn) => (refresh = fn)} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(countCallsTo(lessonsListPath())).toBe(1));
    expect(countCallsTo(CLASSES_LIST_PATH)).toBe(1);

    await act(async () => {
      await refresh?.();
    });

    expect(countCallsTo(lessonsListPath())).toBe(1);
    expect(countCallsTo(CLASSES_LIST_PATH)).toBe(1);
  });

  it('гость (401 на /auth/me) — ничего не греем, роль не известна', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));

    render(
      <MemoryRouter initialEntries={['/planning']}>
        <AuthProvider>
          <FirstScreenPrefetch />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me'));
    expect(countCallsTo(lessonsListPath())).toBe(0);
    expect(countCallsTo(CLASSES_LIST_PATH)).toBe(0);
  });
});
