// Хук в изоляции (CLAUDE.md «Тесты»): apiFetch замокан, `refresh()` и
// `onSaved()` — обычные колбэки, хуку не нужен ни <AuthProvider>, ни
// <MemoryRouter> в дереве. Куда ведёт `onSaved()` на самом деле (переход
// `/welcome` или тихая строка «Профиля») проверяют экраны — WelcomeScreen.test.tsx
// и profile/ProfileNameSection.test.tsx.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEW_PERSON_NAME } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useProfileSetup } from './useProfileSetup';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useProfileSetup — начальные поля из me.name', () => {
  it('«Дмитрий Котов» — разбирается на имя и фамилию (пришедший через Telegram)', () => {
    const { result } = renderHook(() =>
      useProfileSetup('Дмитрий Котов', vi.fn(), vi.fn()),
    );

    expect(result.current.firstName).toBe('Дмитрий');
    expect(result.current.lastName).toBe('Котов');
  });

  it('заглушка нового человека (вход по почте) — оба поля пустые', () => {
    const { result } = renderHook(() =>
      useProfileSetup(NEW_PERSON_NAME, vi.fn(), vi.fn()),
    );

    expect(result.current.firstName).toBe('');
    expect(result.current.lastName).toBe('');
  });
});

describe('useProfileSetup — отправка', () => {
  it('успех — PATCH /me/profile, refresh(), затем onSaved()', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useProfileSetup('Дмитрий Котов', refresh, onSaved),
    );

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Дмитрий', lastName: 'Котов' },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('без фамилии — тело запроса без поля lastName', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useProfileSetup('', vi.fn().mockResolvedValue(undefined), vi.fn()),
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
      useProfileSetup('', vi.fn().mockResolvedValue(undefined), vi.fn()),
    );
    act(() => result.current.setFirstName('  Мария  '));
    act(() => result.current.setLastName('  Ли  '));

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Мария', lastName: 'Ли' },
    });
  });

  it('пустое имя (в том числе из одних пробелов) — запрос не уходит, onSaved() не зовётся', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileSetup('', vi.fn(), onSaved));
    act(() => result.current.setFirstName('   '));

    await act(() => result.current.submit());

    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ApiError — status error, текст с сервера, поля не стираются, refresh() и onSaved() не вызваны', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useProfileSetup('Дмитрий Котов', refresh, onSaved),
    );

    await act(() => result.current.submit());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Сервер не ответил. Попробуйте ещё раз.');
    expect(result.current.firstName).toBe('Дмитрий');
    expect(result.current.lastName).toBe('Котов');
    expect(refresh).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useProfileSetup('Дмитрий', vi.fn(), vi.fn()));

    await act(() => result.current.submit());

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('повтор после ошибки — второй submit() уходит в сеть заново и может завершиться успехом', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Сбой', 500, 'unknown'));
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileSetup('Дмитрий', refresh, onSaved));
    await act(() => result.current.submit());
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(() => result.current.submit());

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('useProfileSetup — save() (ADR-0059, onBeforeLink у TelegramLinkButton)', () => {
  it('пустое имя — ничего не сохраняет, возвращает true, onSaved() не зовёт', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileSetup('', vi.fn(), onSaved));

    const saved = await act(() => result.current.save());

    expect(saved).toBe(true);
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('успех — PATCH /me/profile, refresh(), возвращает true; onSaved() не зовёт (решает вызывающий)', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useProfileSetup('Дмитрий Котов', refresh, onSaved),
    );

    const saved = await act(() => result.current.save());

    expect(saved).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Дмитрий', lastName: 'Котов' },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ApiError — возвращает false, текст ошибки виден, refresh() не вызван', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfileSetup('Дмитрий', refresh, vi.fn()));

    const saved = await act(() => result.current.save());

    expect(saved).toBe(false);
    expect(result.current.error).toBe('Сервер не ответил. Попробуйте ещё раз.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
