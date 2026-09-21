// Юнит-тест хука без формы/DOM (CLAUDE.md «Тесты») — переходы idle → pending
// → sent/error, applyMe(next) после успеха (read-after-write, ADR-0087) и
// текст ошибки. Сеть замокана через apiFetch (тот же приём, что
// useEmailLoginRequest.test.ts).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_LINK_TAKEN_MESSAGE, type MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useEmailLink } from './useEmailLink';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Ответ POST /auth/email/link (ADR-0087) — pendingEmail появляется в нём же,
// второй GET /auth/me за ним не нужен.
const ME: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: [],
  status: 'active',
  telegramLinked: true,
  botChatActive: false,
  hasEmail: false,
  pendingEmail: 'a@example.com',
  noTelegram: false,
  needsProfile: false,
};

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useEmailLink', () => {
  it('изначально idle, ошибки нет', () => {
    const { result } = renderHook(() => useEmailLink(vi.fn()));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('успех — POST /auth/email/link с адресом, затем applyMe(next), status sent', async () => {
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    const { result } = renderHook(() => useEmailLink(applyMe));

    await act(() => result.current.link('a@example.com'));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/link', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    expect(applyMe).toHaveBeenCalledWith(ME);
    expect(result.current.status).toBe('sent');
    expect(result.current.error).toBeNull();
  });

  it('409 — адрес занят другим аккаунтом: status error, текст с сервера, applyMe() не вызван', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(EMAIL_LINK_TAKEN_MESSAGE, 409, 'conflict'),
    );
    const applyMe = vi.fn();
    const { result } = renderHook(() => useEmailLink(applyMe));

    await act(() => result.current.link('a@example.com'));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(EMAIL_LINK_TAKEN_MESSAGE);
    expect(applyMe).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailLink(vi.fn()));

    await act(() => result.current.link('a@example.com'));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});
