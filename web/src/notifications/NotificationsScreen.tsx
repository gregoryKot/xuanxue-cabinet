// Экран «Уведомления» — личная настройка человека, не раздел домена: вход
// из подвала кабинета (AppShell.tsx), в нижнюю навигацию не добавляется
// (docs/adr/0025-navigation-by-domain.md). Доступен любой роли, включая
// ученика — виды ограничены его ролями (defaultNotifications), не гвардом
// маршрута. Переключение — сразу PATCH без оптимистичной отрисовки: строка
// остаётся в прежнем состоянии, пока не пришёл ответ, тем же приёмом, что
// PersonRow.tsx делает с ролями (ТЗ notifications-web.md).
import { useState, type CSSProperties } from 'react';
import {
  NOTIFICATION_HINTS,
  NOTIFICATION_LABELS,
  type NotificationKind,
} from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../api/http';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { Toggle } from '../components/Toggle';
import { useNotificationPrefs } from './useNotificationPrefs';

const EXPLANATION =
  'Здесь вы решаете, что вам приходит. У каждого вида — своя причина и свой переключатель.';
const TELEGRAM_HINT =
  'В Telegram уведомления приходят в личный чат с ботом. Не писали боту — присылать будет некуда.';
const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить уведомление. Попробуйте ещё раз.';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};
const itemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const hintStyle: CSSProperties = {
  margin: '0 0 0 32px',
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const alertStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };
const telegramHintStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export default function NotificationsScreen() {
  const { me } = useAuth();
  const { kinds, enabled, loading, error, reload, setEnabled } = useNotificationPrefs(me);
  // Пока не пришёл первый ответ — enabled ещё null; список ниже рисуется
  // только после загрузки (!loading && !error), но `.includes()` берём от
  // уже нормализованного массива, а не от enabled напрямую.
  const enabledKinds = enabled ?? [];
  const [pendingKind, setPendingKind] = useState<NotificationKind | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function toggle(kind: NotificationKind, checked: boolean) {
    setToggleError(null);
    setPendingKind(kind);
    try {
      await setEnabled(kind, checked);
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : TOGGLE_ERROR_MESSAGE);
    } finally {
      setPendingKind(null);
    }
  }

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonList rows={Math.max(kinds.length, 2)} h={56} />}

      {!loading && !error && (
        <ul style={listStyle}>
          {kinds.map((kind) => (
            <li key={kind} style={itemStyle}>
              <Toggle
                label={NOTIFICATION_LABELS[kind]}
                checked={enabledKinds.includes(kind)}
                disabled={pendingKind === kind}
                onChange={(checked) => void toggle(kind, checked)}
              />
              <p style={hintStyle}>{NOTIFICATION_HINTS[kind]}</p>
            </li>
          ))}
        </ul>
      )}

      {toggleError && (
        <p role="alert" style={alertStyle}>
          {toggleError}
        </p>
      )}

      <p style={telegramHintStyle}>{TELEGRAM_HINT}</p>
    </section>
  );
}
