// Хук в изоляции, без экрана (тот же приём, что useEmailLoginVerify.test.ts):
// useNavigate замокан отдельно от react-router-dom, applyMe — обычный
// vi.fn(), без <AuthProvider> в дереве.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from 'react-router-dom';
import type * as HttpModule from '../api/http';
import type { MeDto } from '@xuanxue/shared';
import { ApiError, apiFetch } from '../api/http';
import { saveNativeAttempt } from './nativeAttempt';
import { saveReturnTo } from './returnTo';
import { useEmailCodeLogin } from './useEmailCodeLogin';

const NATIVE_ATTEMPT_ID = '0123456789abcdef01234567';

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

// Ответ POST /auth/email/code — тот же MeDto, что у GET /auth/me: из него
// хук и кладёт профиль в AuthProvider, без второго запроса (ADR-0087).
const ME: MeDto = {
  id: 'u1',
  name: 'Маша',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
  hasEmail: true,
  studentMode: false,
  teacherMode: false,
  canUseStudentMode: false,
  canUseTeacherMode: false,
  homeHiddenTiles: [],
};

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
  sessionStorage.clear();
});

describe('useEmailCodeLogin', () => {
  it('успех — POST /auth/email/code с адресом и кодом, applyMe(MeDto) из ответа, переход на postLoginPath()', async () => {
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    const { result } = renderHook(() => useEmailCodeLogin(applyMe));

    await result.current.submit('a@example.com', '123456');

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/code', {
      method: 'POST',
      body: { email: 'a@example.com', code: '123456' },
    });
    // Профиль взят из ответа записи, а не перечитан вторым запросом (ADR-0087).
    expect(applyMe).toHaveBeenCalledWith(ME);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
  });

  it('inviteCode (ADR-0030/0036) — едет в теле вместе с адресом и кодом', async () => {
    mockedApiFetch.mockResolvedValue(ME);
    const { result } = renderHook(() => useEmailCodeLogin(vi.fn(), 'a'.repeat(32)));

    await result.current.submit('a@example.com', '123456');

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/code', {
      method: 'POST',
      body: { email: 'a@example.com', code: '123456', inviteCode: 'a'.repeat(32) },
    });
  });

  it('успех, сохранён returnTo /planning?week=2 (аудит L2) — переход туда', async () => {
    saveReturnTo('/planning?week=2');
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    const { result } = renderHook(() => useEmailCodeLogin(applyMe));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/planning?week=2', { replace: true }),
    );
  });

  it('успех, во вкладке попытка Daychi (ADR-0181) — переход на её экран', async () => {
    saveNativeAttempt(NATIVE_ATTEMPT_ID);
    mockedApiFetch.mockResolvedValue(ME);
    const { result } = renderHook(() => useEmailCodeLogin(vi.fn()));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        `/login/native?attempt=${NATIVE_ATTEMPT_ID}`,
        { replace: true },
      ),
    );
  });

  it('ApiError (401 — код не подошёл) — текст с сервера в error, applyMe() и переход не вызваны', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Код не подошёл. Сверьте цифры с письмом или запросите новое.',
        401,
        'unauthorized',
      ),
    );
    const applyMe = vi.fn();
    const { result } = renderHook(() => useEmailCodeLogin(applyMe));

    await result.current.submit('a@example.com', '000000');

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'Код не подошёл. Сверьте цифры с письмом или запросите новое.',
    );
    expect(applyMe).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // 403 — не поломка, а недостающая ссылка-приглашение или блокировка:
  // повтор с новым письмом упрётся в тот же отказ, поэтому он уходит в
  // onRefused, а форма (EmailLoginForm.tsx) уступает место объяснению.
  it('ApiError 403 с onRefused — текст сервера в onRefused, error пуст, статус idle', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
        403,
        'forbidden',
      ),
    );
    const onRefused = vi.fn();
    const { result } = renderHook(() => useEmailCodeLogin(vi.fn(), undefined, onRefused));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() =>
      expect(onRefused).toHaveBeenCalledWith(
        'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
      ),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('ApiError 403 без onRefused — показывается как обычная ошибка', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Доступа нет. Обратитесь к администратору школы.', 403, 'forbidden'),
    );
    const { result } = renderHook(() => useEmailCodeLogin(vi.fn()));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Доступа нет. Обратитесь к администратору школы.');
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailCodeLogin(vi.fn()));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
