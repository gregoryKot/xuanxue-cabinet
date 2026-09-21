import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useNotificationPrefs } from './useNotificationPrefs';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STUDENT: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};
const TEACHER: MeDto = {
  id: 'u2',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

describe('useNotificationPrefs — виды по роли', () => {
  it('ученику доступен один вид — результат экзамена (ADR-0062)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['exam_result'] });
    const { result } = renderHook(() => useNotificationPrefs(STUDENT));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kinds).toEqual(['exam_result']);
    expect(result.current.enabled).toEqual(['exam_result']);
  });

  it('учителю доступны его виды, не ученические', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: [] });
    const { result } = renderHook(() => useNotificationPrefs(TEACHER));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kinds).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
      'attempt_submitted',
    ]);
  });

  it('без сессии (me === null) — дефолт ученика', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: [] });
    const { result } = renderHook(() => useNotificationPrefs(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kinds).toEqual(['exam_result']);
  });
});

describe('useNotificationPrefs — setEnabled (read-after-write из ответа PATCH)', () => {
  it('делает ровно один запрос — PATCH, второго GET нет', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: [] });
    const { result } = renderHook(() => useNotificationPrefs(STUDENT));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Единственный ответ в очереди на это действие: если бы код всё ещё звал
    // reload() следом, второй вызов apiFetch остался бы без мока и упал.
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['exam_result'] });
    await result.current.setEnabled('exam_result', true);

    expect(mockedApiFetch).toHaveBeenCalledTimes(2); // начальный GET + этот PATCH
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      '/me/notifications',
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'exam_result', enabled: true },
      }),
    );
    // applyData() вызван синхронно внутри setEnabled — ждём не сеть (её уже
    // не будет), а перерисовку хука вне act() (тот же приём, что был тут
    // до правки).
    await waitFor(() => expect(result.current.enabled).toEqual(['exam_result']));
  });
});
