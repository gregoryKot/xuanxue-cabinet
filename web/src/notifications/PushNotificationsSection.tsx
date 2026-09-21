// Кнопка «Включить уведомления» (ADR-0092, ПР №5, последний из «Порядка
// работ») — push как добавка к Telegram и ленте кабинета, не замена. Раздел
// стоит сразу под NotificationPrefsSection.tsx на «Профиле» и ссылается на
// её список («то же, что отмечено в списке выше»). Логика — usePushSubscription.ts
// (CLAUDE.md «Логика вне компонентов»), здесь только рендер по состоянию.
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import {
  PUSH_BLOCK_WARNING,
  PUSH_DISABLE_LABEL,
  PUSH_ENABLE_LABEL,
  PUSH_EXPLANATION_DEFAULT,
  PUSH_EXPLANATION_DENIED,
  PUSH_EXPLANATION_IOS_INSTALL,
  PUSH_EXPLANATION_NOT_SUBSCRIBED,
  PUSH_SECTION_HEADING,
  PUSH_SUBSCRIBED_STATUS,
} from './pushNotificationsCopy';
import { usePushSubscription } from './usePushSubscription';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headingStyle: CSSProperties = { margin: 0 };
const alertStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };

export function PushNotificationsSection() {
  const { loading, loadError, reload, state, pending, actionError, enable, disable } =
    usePushSubscription();

  // Пока не знаем, что показать (сервер мог выключить push, браузер — не
  // уметь его) — скелетон без заголовка: разделу нечем гарантировать, что он
  // вообще останется на экране (CLAUDE.md «Загрузка», ТЗ п.5).
  if (loading) return <SkeletonList rows={1} h={56} />;

  if (loadError) {
    return (
      <section style={sectionStyle}>
        <h2 className="xuanxue-eyebrow" style={headingStyle}>
          {PUSH_SECTION_HEADING}
        </h2>
        <LoadErrorBanner message={loadError} onRetry={() => void reload()} />
      </section>
    );
  }

  // Push выключен на сервере или браузер не умеет его вовсе — раздела нет,
  // кнопка, которая заведомо не сработает, хуже отсутствия кнопки (ТЗ п.2).
  if (!state || state.kind === 'hidden') return null;

  const showsEnableButton = state.kind === 'default' || state.kind === 'not-subscribed';

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {PUSH_SECTION_HEADING}
      </h2>

      {state.kind === 'ios-install' && (
        <p style={screenExplanationStyle}>{PUSH_EXPLANATION_IOS_INSTALL}</p>
      )}
      {state.kind === 'denied' && (
        <p style={screenExplanationStyle}>{PUSH_EXPLANATION_DENIED}</p>
      )}
      {state.kind === 'default' && (
        <>
          <p style={screenExplanationStyle}>{PUSH_EXPLANATION_DEFAULT}</p>
          <p style={screenExplanationStyle}>{PUSH_BLOCK_WARNING}</p>
        </>
      )}
      {state.kind === 'not-subscribed' && (
        <p style={screenExplanationStyle}>{PUSH_EXPLANATION_NOT_SUBSCRIBED}</p>
      )}
      {state.kind === 'subscribed' && (
        <p style={screenExplanationStyle}>{PUSH_SUBSCRIBED_STATUS}</p>
      )}

      {showsEnableButton && (
        <Button
          pending={pending}
          onClick={() => void enable()}
          style={primaryActionStyle}
        >
          {PUSH_ENABLE_LABEL}
        </Button>
      )}
      {state.kind === 'subscribed' && (
        <Button
          variant="secondary"
          pending={pending}
          onClick={() => void disable()}
          style={primaryActionStyle}
        >
          {PUSH_DISABLE_LABEL}
        </Button>
      )}

      {actionError && (
        <p role="alert" style={alertStyle}>
          {actionError}
        </p>
      )}
    </section>
  );
}
