// Личный экран человека (`/profile`, ADR-0045, заменяет «Уведомления»,
// ADR-0025) — имя, вход в настройки уведомлений, второй способ входа и «Выйти»
// в одном месте: два похожих личных места за одним значком владелец счёл
// лишним (отзыв 2026-09-18, тот же повод убрать имя из шапки телефона —
// AppShellBrandRow.tsx). Имя — та же форма и тот же хук, что на первом входе
// (`/welcome`, ADR-0044), но человек остаётся на месте
// (ProfileNameSection.tsx). Переключатели уведомлений и push жили здесь
// (ADR-0045, ADR-0092) и переехали на свой экран «Настройки уведомлений»
// (`/notifications/settings`, ADR-0162): на «Профиле» от них осталась
// карточка-переход (NotificationSettingsCard.tsx). Связка Telegram
// живёт в SecondLoginKey.tsx (ADR-0059, общий с welcome/WelcomeScreen.tsx) —
// раньше она была подана как способ получать уведомления, теперь это про то,
// чтобы вход не зависел от одного приложения. Над ней — сводка «Способы
// входа» (LoginKeysSummary.tsx): какая почта привязана и какие ключи есть.
import type { CSSProperties } from 'react';
import { APP_ERRORS_SCREEN_PATH } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { GoogleLinkSection } from '../auth/GoogleLinkSection';
import { hasRole } from '../auth/hasRole';
import { LoginKeysSummary } from '../auth/LoginKeysSummary';
import { LogoutButton } from '../auth/LogoutButton';
import { SecondLoginKey } from '../auth/SecondLoginKey';
import { LegalLinks } from '../legal/LegalLink';
import { ScreenHeader } from '../components/ScreenHeader';
import { screenSectionStyle } from '../components/screenLayout';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { MyPaymentsSection } from '../student/MyPaymentsSection';
import { PaymentContactNote } from '../student/PaymentContactNote';
import {
  isMyPaymentsVisible,
  isPaymentContactVisible,
} from '../student/myPaymentsVisibility';
import { StudentModeSection } from '../studentMode/StudentModeSection';
import { isStandalone } from '../pwa/installEnvironment';
import { INSTALL_SCREEN_PATH } from '../install/installPath';
import { NotificationSettingsCard } from './NotificationSettingsCard';
import { ProfileNameSection } from './ProfileNameSection';

const TITLE = 'Профиль';
const EXPLANATION = 'Имя, способы входа и настройки уведомлений.';
const INSTALL_TITLE = 'Приложение на телефоне';
const INSTALL_HINT = 'Как поставить кабинет на рабочий стол телефона';
const DEV_ERRORS_TITLE = 'Сбои';
const DEV_ERRORS_HINT =
  'Тексты ошибок из браузера и сервера — те же коды, что приходят в Telegram.';

// «Выйти» и (у admin) «Сбои» — отдельные блоки, отбитые волосяной линией:
// раздел разработчика и выход из аккаунта, не личные настройки над ними.
const dividerRowStyle: CSSProperties = {
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

      {/* Абонемент (PLAN §15, слой 2.4) — личное, как имя и уведомления, и
          есть только у человека без ролей штата (тот же признак, что у
          сервера, assertActiveStudent). Не на экране «Занятия»: строка
          рядом с занятием читалась бы условием попасть на него, а неоплата
          ничего не закрывает (ADR-0049, CLAUDE.md «Ноль нагрузки на
          ученика»). */}
      {/* Спрятана флагом (ADR-0157, myPaymentsVisibility.ts). */}
      {isMyPaymentsVisible(me) && <MyPaymentsSection me={me} />}

      {/* Вместо секции выше ученику называют, кому присылать скриншот
          перевода (ADR-0159): контакт бухгалтера из настроек школы. */}
      {isPaymentContactVisible(me) && <PaymentContactNote />}

      {/* Переключатели и push — на своём экране (ADR-0162), здесь вход. */}
      <NotificationSettingsCard me={me} />

      {/* Инструкция установки (docs/PWA.md) — только пока кабинет не стоит
          на этом телефоне уже: standalone-режиму ставить больше некуда. */}
      {!isStandalone() && (
        <SectionLink to={INSTALL_SCREEN_PATH} title={INSTALL_TITLE} hint={INSTALL_HINT} />
      )}

      {/* Сводка ключей входа: показывает, что привязано; предлагают ниже. */}
      {me === null ? <SkeletonList rows={3} h={24} /> : <LoginKeysSummary me={me} />}

      {/* Второй способ входа (ADR-0059) — SecondLoginKey сам решает, что
          предложить (или не рисует ничего, если оба ключа уже на месте). */}
      {me === null ? <SkeletonList rows={1} h={44} /> : <SecondLoginKey me={me} />}

      {/* Google (ADR-0145) — рядом, но отдельно: третий путь входа, не
          замена Telegram/почты, поэтому не внутри SecondLoginKey. Сам решает,
          показываться ли (config.googleLoginEnabled) и что сказать
          (привязан/нет). */}
      {me === null ? <SkeletonList rows={1} h={44} /> : <GoogleLinkSection me={me} />}

      {/* Журнал сбоев (ADR-0132) — вход карточкой, не пункт меню (ADR-0025),
          видна только admin: маршрут за тем же RequireDevErrorsAccess.tsx. */}
      {hasRole(me, 'admin') && (
        <div style={dividerRowStyle}>
          <SectionLink
            to={APP_ERRORS_SCREEN_PATH}
            title={DEV_ERRORS_TITLE}
            hint={DEV_ERRORS_HINT}
          />
        </div>
      )}

      {/* Режим ученика (ADR-0163) — только штату: проверить кабинет глазами
          ученика, не заводя второй аккаунт. Над «Выйти», тем же отбитым
          блоком: инструмент проверки, не личная настройка. */}
      {me?.canUseStudentMode && (
        <div style={dividerRowStyle}>
          <StudentModeSection me={me} />
        </div>
      )}

      <div style={dividerRowStyle}>
        <LogoutButton />
      </div>

      {/* Тихая строка в самом низу: политика и «Доступность» открываются и
          вошедшему (маршруты вне RequireAuth, ADR-0158). Куда написать о
          проблеме с кабинетом, человек ищет в личном разделе, а не на
          странице входа, которую уже прошёл. */}
      <LegalLinks />
    </section>
  );
}
