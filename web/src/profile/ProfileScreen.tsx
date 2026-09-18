// Личный экран человека (`/profile`, ADR-0045, заменяет «Уведомления»,
// ADR-0025) — имя, переключатели уведомлений, связка Telegram и «Выйти» в
// одном месте: два похожих личных места за одним значком владелец счёл
// лишним (отзыв 2026-09-18, тот же повод убрать имя из шапки телефона —
// AppShellBrandRow.tsx). Имя — та же форма и тот же хук, что на первом входе
// (`/welcome`, ADR-0044), но человек остаётся на месте
// (ProfileNameSection.tsx). Переключатели — NotificationPrefsSection.tsx,
// перенесены из удалённого экрана «Уведомления» дословно (CLAUDE.md
// «Отказались от механики — удаляем с концами»).
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { screenHintStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { NotificationPrefsSection } from '../notifications/NotificationPrefsSection';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { ProfileNameSection } from './ProfileNameSection';

const TITLE = 'Профиль';
const EXPLANATION = 'Ваше имя видят учитель и помощники. Ниже — что присылать и куда.';
const TELEGRAM_HINT =
  'В Telegram уведомления приходят в личный чат с ботом. Не писали боту — присылать будет некуда.';
// Заменяет TELEGRAM_HINT, пока Telegram не связан (ADR-0034): две строки
// подряд об одном и том же читались бы как повтор (docs/VOICE.md).
const TELEGRAM_LINK_EXPLANATION =
  'Telegram ещё не связан с кабинетом. Свяжите его, чтобы уведомления начали приходить.';

// Приписка того же веса, что подсказка под шапкой, но стоит внизу — своего
// отрицательного отступа ей не нужно (перенесено из удалённого экрана
// «Уведомления»).
const telegramHintStyle: CSSProperties = { ...screenHintStyle, margin: 0 };
// «Выйти» — отдельно от остального волосяной линией (перенесено оттуда же).
const logoutRowStyle: CSSProperties = {
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

export default function ProfileScreen() {
  const { me, refresh } = useAuth();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {/* `me` приходит асинхронно — ProfileNameSection рождается только с
          настоящим именем (см. шапку файла), до этого его форму заменяет
          скелетон по её форме: два поля ввода. */}
      {me === null ? (
        <SkeletonList rows={2} h={48} />
      ) : (
        <ProfileNameSection initialName={me.name} refresh={refresh} />
      )}

      <NotificationPrefsSection />

      {me?.telegramLinked === false ? (
        <TelegramLinkButton explanation={TELEGRAM_LINK_EXPLANATION} />
      ) : (
        <p style={telegramHintStyle}>{TELEGRAM_HINT}</p>
      )}

      <div style={logoutRowStyle}>
        <LogoutButton />
      </div>
    </section>
  );
}
