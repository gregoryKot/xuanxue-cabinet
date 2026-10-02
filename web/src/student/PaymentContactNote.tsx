// Секция «Оплата» на экране «Профиль» (ADR-0159): вместо кнопки «Отправить
// скриншот» ученику называют, кому и куда присылать снимок оплаты, — бухгалтеру
// напрямую, не через бот и не через кабинет. Способ связи («в Telegram»,
// WhatsApp) учитель пишет в самом контакте, из кода он убран. Контакт — настройка
// школы (экран «Шаблоны»), ученику он приезжает в его же GET /me/payments:
// GET /settings ему закрыт. Заголовок — рубрика `.xuanxue-eyebrow`, как у
// соседних секций профиля. Свой день напоминания — PaymentReminderDayField
// (ADR-0161). Показ только ученику решает
// isPaymentContactVisible (myPaymentsVisibility.ts), не условие в JSX.
import type { CSSProperties } from 'react';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { PaymentReminderDayField } from './PaymentReminderDayField';
import { useMyPayments } from './useMyPayments';

const HEADING = 'Оплата';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

export function PaymentContactNote() {
  const { page, loading, error, reload, applyReminder } = useMyPayments();

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        {HEADING}
      </h2>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !error && <SkeletonLines widths={['85%']} />}

      {page && !error && (
        <p style={screenExplanationStyle}>
          {/* Без `**` вокруг контакта: ник внутри него ссылка, а ссылка сама
              выделена; акцент разрывался бы на непарные маркеры. */}
          <RichText text={`Отправьте скриншот об оплате ${page.contact}.`} />
        </p>
      )}

      {/* Выбор дня — только когда школа напоминание включила: сервер тогда
          присылает `reminder` (ADR-0161, ADR-0069), иначе выбирать нечего. */}
      {page?.reminder && !error && (
        <PaymentReminderDayField reminder={page.reminder} onSaved={applyReminder} />
      )}
    </section>
  );
}
