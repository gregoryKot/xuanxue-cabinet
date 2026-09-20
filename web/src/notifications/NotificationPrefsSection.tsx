// Переключатели уведомлений — раздел внутри «Профиля» (ADR-0045, было
// отдельным экраном `/notifications`, ADR-0025). Заголовок — рубрика
// `.xuanxue-eyebrow`, не второй `<h1>` (тот же приём, что
// student/TasksScreen.tsx: на экране один h1, у ProfileScreen.tsx).
// Доступен любой роли, включая ученика — виды ограничены его ролями
// (defaultNotifications), не гвардом маршрута. Переключение — сразу PATCH
// без оптимистичной отрисовки: строка остаётся в прежнем состоянии, пока не
// пришёл ответ, тем же приёмом, что PersonRow.tsx делает с ролями.
import { useState, type CSSProperties } from 'react';
import {
  NOTIFICATION_HINTS,
  NOTIFICATION_LABELS,
  type NotificationKind,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenHintStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { Toggle } from '../components/Toggle';
import { useNotificationPrefs } from './useNotificationPrefs';

const HEADING = 'Уведомления';
const EXPLANATION =
  'Здесь вы решаете, что вам приходит. У каждого вида — своя причина и свой переключатель.';
// Бот и «Профиль» переключают одно и то же (отзыв владельца 2026-09-19,
// ADR-0065) — короткая строка тут же, чтобы человек не держал в голове два
// разных места ради одной настройки.
const BOT_HINT = 'То же самое можно переключить в боте — командой /notifications.';
const TOGGLE_ERROR_MESSAGE = 'Не удалось изменить уведомление. Попробуйте ещё раз.';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера — расстояние держит `gap` колонки.
const headingStyle: CSSProperties = { margin: 0 };
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

export function NotificationPrefsSection() {
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
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {HEADING}
      </h2>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>
      <p style={screenHintStyle}>{BOT_HINT}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {/* Скелетон по форме будущего содержимого (CLAUDE.md «Загрузка»):
          сколько видов человеку положено по ролям, столько и строк —
          `kinds` считается из `me.roles` сразу, ответа сервера не ждёт.
          Пол в единицу, а не в двойку (ADR-0062): у ученика вид ровно один,
          и прежняя двойка рисовала две заглушки, а потом одну настоящую
          строку — макет прыгал на каждой загрузке «Профиля». Единица нужна
          на случай, когда `me` ещё не пришёл и список пуст: пустой скелетон
          — это пустота, а её правило как раз запрещает. */}
      {loading && !error && <SkeletonList rows={Math.max(kinds.length, 1)} h={56} />}

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
    </section>
  );
}
