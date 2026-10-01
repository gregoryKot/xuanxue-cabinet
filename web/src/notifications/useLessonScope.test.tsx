// Данные экрана про занятия (useLessonScope.ts, ADR-0162): кому они нужны и как
// ответ записи ложится на экран. Остальное — через экран и блоки, которые их
// читают (LessonScopeSection.test.tsx, LessonReminderField.test.tsx); здесь —
// то, до чего через экран не дотянуться: ответ записи, пришедший раньше
// самого `GET`.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto, MyLessonNotificationsDto, UserRole } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { hasLessonSettings, useLessonScope } from './useLessonScope';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LESSONS_PATH = '/me/notifications/lessons';
const SCOPE_PATH = '/me/notifications/lessons/scope';
const REMINDER_PATH = '/me/notifications/lessons/reminder-minutes';

const personWith = (roles: UserRole[]): MeDto => ({
  id: 'u1',
  name: 'Мария Ли',
  roles,
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  email: 'maria@example.com',
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
  studentMode: false,
  canUseStudentMode: false,
});

const lessons = (minutes: number | null): MyLessonNotificationsDto => ({
  scope: { mode: 'selected', classIds: ['c1'] },
  scopeChosen: true,
  classes: [],
  reminder: { minutes, schoolMinutes: 60 },
});

describe('hasLessonSettings', () => {
  it('пока `me` не пришёл — нет', () => {
    expect(hasLessonSettings(null)).toBe(false);
  });

  it('ученик без ролей — да', () => {
    expect(hasLessonSettings(personWith([]))).toBe(true);
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — нет: вида про занятие у него нет',
    (role) => {
      expect(hasLessonSettings(personWith([role]))).toBe(false);
    },
  );
});

describe('useLessonScope — ответ записи раньше `GET`', () => {
  function renderWithPendingGet(saved: { scope?: unknown; reminder?: unknown }) {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(personWith([]));
      if (path === LESSONS_PATH) return new Promise(() => undefined);
      if (path === SCOPE_PATH) return Promise.resolve(saved.scope);
      if (path === REMINDER_PATH) return Promise.resolve(saved.reminder);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    return renderHook(() => useLessonScope(), { wrapper });
  }

  // Своей половины у ответа записи, пока нечем дополнить, нет: он полный
  // (тот же MyLessonNotificationsDto, что у `GET`) и становится данными целиком.
  it('запись выбора занятий — ответ становится данными целиком, включая «за сколько»', async () => {
    const { result } = renderWithPendingGet({ scope: lessons(30) });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(() => result.current.save({ mode: 'selected', classIds: ['c1'] }));

    expect(result.current.scope).toEqual({ mode: 'selected', classIds: ['c1'] });
    expect(result.current.scopeChosen).toBe(true);
    expect(result.current.reminder).toEqual({ minutes: 30, schoolMinutes: 60 });
    expect(result.current.loading).toBe(false);
  });

  it('запись «за сколько» — ответ становится данными целиком, включая выбор занятий', async () => {
    const { result } = renderWithPendingGet({ reminder: lessons(120) });
    await waitFor(() => expect(result.current.loading).toBe(true));

    act(() => result.current.applyReminder(lessons(120)));

    expect(result.current.reminder).toEqual({ minutes: 120, schoolMinutes: 60 });
    expect(result.current.scope).toEqual({ mode: 'selected', classIds: ['c1'] });
  });
});

describe('useLessonScope — «выбирал ли человек сам»', () => {
  it('в ответе `GET` — false, после записи «все» — true из ответа `PUT`, без второго `GET`', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(personWith([]));
      if (path === LESSONS_PATH)
        return Promise.resolve({ ...lessons(null), scopeChosen: false });
      if (path === SCOPE_PATH) return Promise.resolve(lessons(null));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
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
  it('штат — запроса за занятиями нет, загрузки нет, данных нет', async () => {
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/me'
        ? Promise.resolve(personWith(['teacher']))
        : Promise.reject(new Error(`неожиданный путь: ${path}`)),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useLessonScope(), { wrapper });

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
    );
    // Дать `me` лечь в состояние: до этого «нет запроса» было бы верно и у ученика.
    await act(() => Promise.resolve());
    expect(result.current.loading).toBe(false);
    expect(result.current.reminder).toBeNull();
    expect(result.current.scopeChosen).toBeNull();
    expect(
      mockedApiFetch.mock.calls.filter(([path]) => path === LESSONS_PATH),
    ).toHaveLength(0);
  });
});
