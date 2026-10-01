// Переключатели уведомлений — раздел «Что присылать» на экране «Настройки
// уведомлений» (NotificationSettingsScreen.tsx, ADR-0162; до него жил на
// «Профиле», ADR-0045, а раньше — отдельным экраном, ADR-0025). Заголовок —
// рубрика `.xuanxue-eyebrow`, не второй `<h1>` (тот же приём, что
// student/TasksScreen.tsx: на экране один h1 — у самого экрана).
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
import { RichText } from '../components/RichText';
import { screenHintStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { Toggle } from '../components/Toggle';
import { useNotificationPrefs } from './useNotificationPrefs';

// Рядом на экране push и выбор занятий, поэтому блок назван по содержимому:
// «Уведомления» — это уже название всего экрана.
const HEADING = 'Что присылать';
// Бот и кабинет переключают одно и то же (отзыв владельца 2026-09-19,
// ADR-0065) — короткая строка тут же, чтобы человек не держал в голове два
// разных места ради одной настройки.
const BOT_HINT = 'То же самое можно переключить в боте — командой **/notifications**.';
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
      {/* Строка про команду бота — только когда боту есть куда писать
          (отзыв владельца 2026-09-22): без личного чата с ботом команда
          /notifications недоступна и спорит с блоком «Второй способ входа»
          на этом же экране («Telegram у вас нет» / связан без чата с ботом).
          Признак — `botChatActive`, не `telegramLinked`: у вошедшего через
          виджет Telegram `telegramLinked` истинен сразу, а личного чата с
          ботом нет (ADR-0042, то же в telegram/showsTelegramOffer.ts). Читаем
          поле прямо тут, как AttemptReviewScreen.tsx — вопрос «работает ли
          команда бота» не тот же, что у showsTelegramOffer/showsTelegramHint
          («предлагать ли связать»), отдельного предиката под него не заводим. */}
      {(me?.botChatActive ?? false) && (
        <p style={screenHintStyle}>
          <RichText text={BOT_HINT} />
        </p>
      )}

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {/* Скелетон по форме будущего содержимого (CLAUDE.md «Загрузка»):
          сколько видов человеку положено по ролям, столько и строк —
          `kinds` считается из `me.roles` сразу, ответа сервера не ждёт.
          `Math.max(kinds.length, 1)`, не голое `kinds.length` (ADR-0062): пока
          `me` ещё не пришёл и список пуст, ноль строк — это пустота, а её
          правило как раз запрещает; единица держит место хотя бы для одной
          строки, пока роли не посчитаны. У ученика (ADR-0135, ADR-0150) видов
          три — результат экзамена, напоминания о занятии и об оплате, — и
          `kinds.length` заранее знает это число, второго прыжка макета нет. */}
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
