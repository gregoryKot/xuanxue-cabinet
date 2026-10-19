// Фильтр «о каких занятиях» для подсказки в ленте (useLessonScope.ts, ADR-0162):
// кому он нужен и как ответ записи ложится на экран. Подсказка в подробностях —
// LessonScopeHint.test.tsx; здесь то, до чего через неё не дотянуться: ответ
// записи, пришедший раньше самого `GET`.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MyLessonNotificationsDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { makeMe } from '../test-support/meFixture';
import { hasLessonSettings, useLessonScope } from './useLessonScope';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LESSONS_PATH = '/me/notifications/lessons';
const SCOPE_PATH = '/me/notifications/lessons/scope';

const lessons = (scopeChosen: boolean): MyLessonNotificationsDto => ({
  scope: { mode: 'selected', classIds: ['c1'] },
  scopeChosen,
  classes: [],
  reminder: { minutes: null, schoolMinutes: 60 },
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('hasLessonSettings', () => {
  it('пока `me` не пришёл — нет', () => {
    expect(hasLessonSettings(null)).toBe(false);
  });

  it('ученик без ролей — да', () => {
    expect(hasLessonSettings(makeMe({ roles: [] }))).toBe(true);
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — нет: вида про занятие у него нет',
    (role) => {
      expect(hasLessonSettings(makeMe({ roles: [role] }))).toBe(false);
    },
  );
});

describe('useLessonScope — ответ записи раньше `GET`', () => {
  // Своей половины у ответа записи, пока нечем дополнить, нет: он полный
  // (тот же MyLessonNotificationsDto, что у `GET`) и становится данными целиком.
  it('ответ записи становится данными целиком, `GET` второй раз не уходит', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(makeMe());
      if (path === LESSONS_PATH) return new Promise(() => undefined);
      if (path === SCOPE_PATH) return Promise.resolve(lessons(true));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const { result } = renderHook(() => useLessonScope(), { wrapper });
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(LESSONS_PATH, expect.anything()),
    );

    await act(() => result.current.save({ mode: 'selected', classIds: ['c1'] }));

    expect(result.current.scope).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(result.current.scopeChosen).toBe(true);
    expect(
      mockedApiFetch.mock.calls.filter(([path]) => path === LESSONS_PATH),
    ).toHaveLength(1);
  });
});

describe('useLessonScope — «выбирал ли человек сам»', () => {
  it('в ответе `GET` — false, после записи «все» — true из ответа `PUT`, без второго `GET`', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(makeMe());
      if (path === LESSONS_PATH) return Promise.resolve(lessons(false));
      if (path === SCOPE_PATH) return Promise.resolve(lessons(true));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const { result } = renderHook(() => useLessonScope(), { wrapper });
    await waitFor(() => expect(result.current.scopeChosen).toBe(false));

    await act(() => result.current.save({ mode: 'all', classIds: [] }));

    expect(result.current.scopeChosen).toBe(true);
    expect(
      mockedApiFetch.mock.calls.filter(([path]) => path === LESSONS_PATH),
    ).toHaveLength(1);
  });
});

describe('useLessonScope — кому за данными ходить', () => {
  it('штат — запроса за занятиями нет, данных нет', async () => {
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/me'
        ? Promise.resolve(makeMe({ roles: ['teacher'] }))
        : Promise.reject(new Error(`неожиданный путь: ${path}`)),
    );
    const { result } = renderHook(() => useLessonScope(), { wrapper });

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
    );
    // Дать `me` лечь в состояние: до этого «нет запроса» было бы верно и у ученика.
    await act(() => Promise.resolve());
    expect(result.current.scope).toBeNull();
    expect(result.current.scopeChosen).toBeNull();
    expect(
      mockedApiFetch.mock.calls.filter(([path]) => path === LESSONS_PATH),
    ).toHaveLength(0);
  });
});
