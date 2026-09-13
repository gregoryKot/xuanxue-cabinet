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
  roles: ['student'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};
const TEACHER: MeDto = {
  id: 'u2',
  name: 'Учитель',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

describe('useNotificationPrefs — виды по роли', () => {
  it('ученику доступны его два вида, независимо от того, что включено', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['lesson_soon'] });
    const { result } = renderHook(() => useNotificationPrefs(STUDENT));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kinds).toEqual(['lesson_soon', 'teacher_message']);
    expect(result.current.enabled).toEqual(['lesson_soon']);
  });

  it('учителю доступны его виды, не ученические', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: [] });
    const { result } = renderHook(() => useNotificationPrefs(TEACHER));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kinds).toEqual([
      'post_draft',
      'recording_request',
      'delivery_failed',
    ]);
  });

  it('без сессии (me === null) — дефолт ученика', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: [] });
    const { result } = renderHook(() => useNotificationPrefs(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kinds).toEqual(['lesson_soon', 'teacher_message']);
  });
});

describe('useNotificationPrefs — setEnabled (read-after-write)', () => {
  it('PATCH /me/notifications с нужным телом, затем перечитывает состояние', async () => {
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['lesson_soon'] });
    const { result } = renderHook(() => useNotificationPrefs(STUDENT));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['lesson_soon', 'teacher_message'] });
    await result.current.setEnabled('teacher_message', true);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/me/notifications',
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'teacher_message', enabled: true },
      }),
    );
    await waitFor(() =>
      expect(result.current.enabled).toEqual(['lesson_soon', 'teacher_message']),
    );
  });
});
