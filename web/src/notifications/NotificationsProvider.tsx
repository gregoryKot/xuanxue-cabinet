// Общие данные центра уведомлений на всё приложение (ADR-0063) — значок в
// оболочке и экран `/notifications` читают один и тот же хук через контекст,
// а не заводят каждый свой: иначе «Прочитать все» на экране не погасило бы
// цифру на значке до следующего похода в сеть, а сама лента запрашивалась бы
// дважды. Приём — как у auth/AuthProvider.tsx (единственный источник сессии
// на приложение).
//
// `me` приходит пропом от AppShell.tsx (он уже читает сессию и так же
// передаёт её в AppNav), а не вторым useAuth() внутри — хук данных остаётся
// чистым и тестируется без AuthProvider (тот же приём, что
// useNotificationPrefs(me), NotificationPrefsSection.tsx).
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { useNotificationsData, type NotificationsData } from './useNotificationsData';

const NotificationsContext = createContext<NotificationsData | null>(null);

export function NotificationsProvider({
  me,
  children,
}: {
  me: MeDto | null;
  children: ReactNode;
}) {
  const data = useNotificationsData(me);
  const {
    items,
    unreadCount,
    newTasks,
    count,
    loading,
    error,
    reload,
    markRead,
    markAllRead,
  } = data;

  // Разложено по полям, а не `[data]`: сам объект хук пересобирает каждым
  // рендером, и мемо по ссылке на него не экономило бы ничего.
  const value = useMemo(
    () => ({
      items,
      unreadCount,
      newTasks,
      count,
      loading,
      error,
      reload,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, newTasks, count, loading, error, reload, markRead, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsData {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications() вызван вне <NotificationsProvider>');
  return ctx;
}
