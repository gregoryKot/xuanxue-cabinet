// Юнит-тест хука без компонента/DOM (CLAUDE.md «Тесты») — тело запроса,
// read-after-write через applyMe() (ADR-0087) и текст ошибки. Сеть замокана
// через apiFetch (тот же приём, что useEmailLink.test.ts).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useNoTelegram } from './useNoTelegram';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Ответ PUT /me/no-telegram (ADR-0087) — конкретное значение поля не важно
// тестам этого файла, важно, что applyMe() получает именно его.
const ME: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: true,
  noTelegram: true,
  needsProfile: false,
};

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useNoTelegram', () => {
  it('изначально не занят, ошибки нет', () => {
    const { result } = renderHook(() => useNoTelegram(vi.fn()));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('постановка отметки — PUT с { noTelegram: true }, затем applyMe(next)', async () => {
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    const { result } = renderHook(() => useNoTelegram(applyMe));

    await act(() => result.current.set(true));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/no-telegram', {
      method: 'PUT',
      body: { noTelegram: true },
    });
    expect(applyMe).toHaveBeenCalledWith(ME);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('снятие отметки — PUT с { noTelegram: false }', async () => {
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    const { result } = renderHook(() => useNoTelegram(applyMe));

    await act(() => result.current.set(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/no-telegram', {
      method: 'PUT',
      body: { noTelegram: false },
    });
    expect(applyMe).toHaveBeenCalledWith(ME);
  });

  it('ошибка сервера — текст в error, applyMe() не вызван', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
    );
    const applyMe = vi.fn();
    const { result } = renderHook(() => useNoTelegram(applyMe));

    await act(() => result.current.set(true));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe('Сервер не ответил. Попробуйте ещё раз.');
    expect(applyMe).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useNoTelegram(vi.fn()));

    await act(() => result.current.set(true));

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});
