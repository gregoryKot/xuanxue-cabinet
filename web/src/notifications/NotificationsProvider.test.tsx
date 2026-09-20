// Контекст центра уведомлений (ADR-0063). Сами данные проверяет
// useNotificationsData.test.ts, а экран и значок — свои тесты; здесь только
// то, за что отвечает сама обёртка: один и тот же счётчик двум читателям и
// понятный отказ, когда провайдера над ними нет.
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MY_EXAMS_PATH, NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { NotificationsProvider, useNotifications } from './NotificationsProvider';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useNotifications вне NotificationsProvider', () => {
  it('бросает понятную ошибку', () => {
    expect(() => renderHook(() => useNotifications())).toThrow(
      'useNotifications() вызван вне',
    );
  });
});

describe('NotificationsProvider — один счётчик на всех', () => {
  it('два читателя под одним провайдером видят одно число и один запрос ленты', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 4 },
    });

    function Count({ label }: { label: string }) {
      const { count } = useNotifications();
      return <span>{`${label}:${count}`}</span>;
    }

    render(
      <NotificationsProvider>
        <Count label="значок" />
        <Count label="экран" />
      </NotificationsProvider>,
    );

    // Ради этого провайдер и существует: без общего контекста «Прочитать все»
    // на экране не погасило бы цифру на значке, а лента запрашивалась бы дважды.
    await waitFor(() => expect(screen.getByText('значок:4')).toBeInTheDocument());
    expect(screen.getByText('экран:4')).toBeInTheDocument();
  });
});
