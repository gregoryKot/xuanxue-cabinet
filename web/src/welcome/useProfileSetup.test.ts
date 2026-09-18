// Хук в изоляции, без экрана (тот же приём, что useEmailLoginVerify.test.ts):
// useNavigate замокан отдельно от react-router-dom, refresh() передаётся как
// обычный колбэк — хуку не нужен <AuthProvider> в дереве.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from 'react-router-dom';
import { NEW_PERSON_NAME } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { saveReturnTo } from '../auth/returnTo';
import { useProfileSetup } from './useProfileSetup';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof RouterModule>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
  sessionStorage.clear();
});

describe('useProfileSetup — начальные поля из me.name', () => {
  it('«Дмитрий Котов» — разбирается на имя и фамилию (пришедший через Telegram)', () => {
    const { result } = renderHook(() => useProfileSetup('Дмитрий Котов', vi.fn()));

    expect(result.current.firstName).toBe('Дмитрий');
    expect(result.current.lastName).toBe('Котов');
  });

  it('заглушка нового человека (вход по почте) — оба поля пустые', () => {
    const { result } = renderHook(() => useProfileSetup(NEW_PERSON_NAME, vi.fn()));

    expect(result.current.firstName).toBe('');
    expect(result.current.lastName).toBe('');
  });
});

describe('useProfileSetup — отправка', () => {
  it('успех, нет сохранённого returnTo — PATCH /me/profile, refresh(), переход на «/»', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfileSetup('Дмитрий Котов', refresh));

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Дмитрий', lastName: 'Котов' },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(result.current.error).toBeNull();
  });

  it('без фамилии — тело запроса без поля lastName', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useProfileSetup('', vi.fn().mockResolvedValue(undefined)),
    );
    act(() => result.current.setFirstName('Гриша'));

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Гриша' },
    });
  });

  it('обрезает пробелы по краям обеих частей перед отправкой', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useProfileSetup('', vi.fn().mockResolvedValue(undefined)),
    );
    act(() => result.current.setFirstName('  Мария  '));
    act(() => result.current.setLastName('  Ли  '));

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Мария', lastName: 'Ли' },
    });
  });

  it('успех, сохранён returnTo /planning?week=2 (глубокая ссылка) — переход туда', async () => {
    saveReturnTo('/planning?week=2');
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useProfileSetup('Дмитрий', vi.fn().mockResolvedValue(undefined)),
    );

    await act(() => result.current.submit());

    expect(navigateMock).toHaveBeenCalledWith('/planning?week=2', { replace: true });
  });

  it('пустое имя (в том числе из одних пробелов) — запрос не уходит', async () => {
    const { result } = renderHook(() => useProfileSetup('', vi.fn()));
    act(() => result.current.setFirstName('   '));

    await act(() => result.current.submit());

    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('ApiError — status error, текст с сервера, поля не стираются, refresh() и переход не вызваны', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfileSetup('Дмитрий Котов', refresh));

    await act(() => result.current.submit());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Сервер не ответил. Попробуйте ещё раз.');
    expect(result.current.firstName).toBe('Дмитрий');
    expect(result.current.lastName).toBe('Котов');
    expect(refresh).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useProfileSetup('Дмитрий', vi.fn()));

    await act(() => result.current.submit());

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('повтор после ошибки — второй submit() уходит в сеть заново и может завершиться успехом', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Сбой', 500, 'unknown'));
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfileSetup('Дмитрий', refresh));
    await act(() => result.current.submit());
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });
});
