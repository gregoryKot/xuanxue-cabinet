// Личный экран человека (`/profile`, ADR-0045, заменяет «Уведомления»,
// ADR-0025) — имя, переключатели уведомлений, второй способ входа и «Выйти» в
// одном месте: два похожих личных места за одним значком владелец счёл
// лишним (отзыв 2026-09-18, тот же повод убрать имя из шапки телефона —
// AppShellBrandRow.tsx). Имя — та же форма и тот же хук, что на первом входе
// (`/welcome`, ADR-0044), но человек остаётся на месте
// (ProfileNameSection.tsx). Переключатели — NotificationPrefsSection.tsx,
// перенесены из удалённого экрана «Уведомления» дословно (CLAUDE.md
// «Отказались от механики — удаляем с концами»). Сразу под ними —
// PushNotificationsSection.tsx (ADR-0092, ПР №5): кнопка «Включить
// уведомления», добавка к тем же видам, не отдельный список. Связка Telegram
// живёт в SecondLoginKey.tsx (ADR-0059, общий с welcome/WelcomeScreen.tsx) —
// раньше она была подана как способ получать уведомления, теперь это про то,
// чтобы вход не зависел от одного приложения.
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { SecondLoginKey } from '../auth/SecondLoginKey';
import { ScreenHeader } from '../components/ScreenHeader';
import { screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { NotificationPrefsSection } from '../notifications/NotificationPrefsSection';
import { PushNotificationsSection } from '../notifications/PushNotificationsSection';
import { ProfileNameSection } from './ProfileNameSection';

const TITLE = 'Профиль';
const EXPLANATION = 'Ниже — что присылать и куда.';

// «Выйти» — отдельно от остального волосяной линией (перенесено оттуда же).
const logoutRowStyle: CSSProperties = {
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

export default function ProfileScreen() {
  const { me, applyMe } = useAuth();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {/* `me` приходит асинхронно — ProfileNameSection рождается только с
          настоящим именем (см. шапку файла), до этого его форму заменяет
          скелетон по её форме: два поля ввода. */}
      {me === null ? (
        <SkeletonList rows={2} h={48} />
      ) : (
        <ProfileNameSection initialName={me.name} applyMe={applyMe} />
      )}

      <NotificationPrefsSection />
      <PushNotificationsSection />

      {/* Второй способ входа (ADR-0059) — SecondLoginKey сам решает, что
          предложить (или не рисует ничего, если оба ключа уже на месте). */}
      {me === null ? <SkeletonList rows={1} h={44} /> : <SecondLoginKey me={me} />}

      <div style={logoutRowStyle}>
        <LogoutButton />
      </div>
    </section>
  );
}
