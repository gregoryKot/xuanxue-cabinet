// Экран «Уведомления» (`/notifications`, ADR-0063) — лента событий, которые
// уходят человеку в Telegram, плюс карточки заданий, к которым ученик ещё не
// приступал. Данные — общий контекст NotificationsProvider (тот же, что
// кормит значок в оболочке), здесь их только читаем.
//
// `ListScreenBody` не подходит: он рисует ОДИН список по единому состоянию
// загрузки, а здесь над рубриками ленты ещё стоят карточки новых заданий, и
// у ленты своя пара «Сегодня»/«Раньше». Состав собран руками, тем же приёмом,
// что уже сделан на TasksScreen.tsx (баннер ошибки, скелетон, честная фраза,
// группы).
//
// Экран — страница по адресу, не лист поверх списка: ADR-0033 увёл редакторы
// на адреса, единственный оставшийся в кабинете `position: fixed; inset: 0` —
// components/ConfirmDialog.tsx, второй оверлей пошёл бы против течения.
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { cardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { TextLinkButton } from '../components/TextLinkButton';
import { showsTelegramOffer } from '../telegram/showsTelegramOffer';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { NewTaskCard } from './NewTaskCard';
import { NotificationGroup } from './NotificationGroup';
import { groupByDay } from './notificationFeed';
import { useNotifications } from './NotificationsProvider';

const TITLE = 'Уведомления';
const EXPLANATION =
  'Те же события, что уходят вам в Telegram, — на случай, если бот пока не написал.';
const EMPTY_MESSAGE = 'Уведомлений пока нет.';
const TODAY_RUBRIC = 'Сегодня';
const EARLIER_RUBRIC = 'Раньше';
const MARK_ALL_LABEL = 'Прочитать все';
// Тот же приём, что TELEGRAM_LINK_EXPLANATION на GradingQueueScreen.tsx: там
// причина — про очередь проверки, здесь — про уведомления вообще (ADR-0042).
const TELEGRAM_EXPLANATION =
  'Бот пишет обо всём этом в личный чат, а вашего чата с ним пока нет. ' +
  'Свяжите Telegram и нажмите в боте «Запустить».';

// «Выйти» на ProfileScreen.tsx — тот же приём: волосяная линия отделяет
// второстепенный блок от основного содержимого экрана.
const telegramRowStyle: CSSProperties = {
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

export default function NotificationsScreen() {
  const {
    items,
    unreadCount,
    newTasks,
    loading,
    error,
    actionError,
    reload,
    markRead,
    markAllRead,
  } = useNotifications();
  const { me } = useAuth();

  // Без useMemo нарочно: зависимостей у момента «сейчас» нет и не будет,
  // лишняя пустая зависимость только поссорила бы react-hooks/exhaustive-deps.
  const nowIso = new Date().toISOString();

  const groups = items !== null ? groupByDay(items, nowIso) : null;
  const isEmpty = items !== null && items.length === 0 && newTasks.length === 0;
  // Один баннер на error (сбой загрузки) и actionError (сбой markRead/
  // markAllRead, аудит 2026-09-21) — оба текста непустые, `?? ''` был бы
  // недостижимой веткой (баннер ниже рендерится только когда bannerMessage
  // истинен).
  const bannerMessage = error ?? actionError;
  // Условие — общий предикат telegram/showsTelegramOffer.ts, а не своя
  // проверка здесь: то же предложение стоит ещё на трёх экранах, и условие у
  // всех четырёх обязано меняться разом (ADR-0042 — почему `botChatActive`, а
  // не `telegramLinked`).
  const telegramSuggestion = showsTelegramOffer(me) && (
    <TelegramLinkButton explanation={TELEGRAM_EXPLANATION} variant="secondary" />
  );

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        action={
          // Именно unreadCount, не общий count: в count входят ещё карточки
          // новых заданий, которых «Прочитать все» не касается, а кнопка, что
          // ничего не делает, хуже отсутствующей.
          unreadCount > 0 && (
            <TextLinkButton onClick={() => void markAllRead()}>
              {MARK_ALL_LABEL}
            </TextLinkButton>
          )
        }
      />

      {bannerMessage && (
        <LoadErrorBanner
          message={bannerMessage}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {/* Только первая загрузка: markRead перечитывает ленту, и на голом
          `loading` список схлопывался бы в скелетон от каждого нажатия по
          строке. */}
      {loading && items === null && <SkeletonList rows={4} h={72} />}

      {newTasks.length > 0 && (
        <ul style={cardListStyle}>
          {newTasks.map((exam) => (
            <NewTaskCard key={exam.id} exam={exam} />
          ))}
        </ul>
      )}

      {groups && groups.today.length > 0 && (
        <NotificationGroup
          title={TODAY_RUBRIC}
          items={groups.today}
          nowIso={nowIso}
          onRead={(id) => void markRead(id)}
        />
      )}
      {groups && groups.earlier.length > 0 && (
        <NotificationGroup
          title={EARLIER_RUBRIC}
          items={groups.earlier}
          nowIso={nowIso}
          onRead={(id) => void markRead(id)}
        />
      )}

      {isEmpty && (
        <>
          <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
          {telegramSuggestion}
        </>
      )}
      {!isEmpty && telegramSuggestion && (
        <div style={telegramRowStyle}>{telegramSuggestion}</div>
      )}
    </section>
  );
}
