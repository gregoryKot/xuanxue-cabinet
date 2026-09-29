// Секция «Оплата» на экране «Профиль» (ADR-0159): вместо кнопки «Отправить
// скриншот» ученику называют, кому присылать снимок перевода, — бухгалтеру
// напрямую в Telegram, не через бот и не через кабинет. Контакт — настройка
// школы (экран «Шаблоны»), ученику он приезжает в его же GET /me/payments:
// GET /settings ему закрыт. Заголовок — рубрика `.xuanxue-eyebrow`, как у
// соседних секций профиля. Показ только ученику решает
// isPaymentContactVisible (myPaymentsVisibility.ts), не условие в JSX.
import type { CSSProperties } from 'react';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { useMyPayments } from './useMyPayments';

const HEADING = 'Оплата';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

export function PaymentContactNote() {
  const { page, loading, error, reload } = useMyPayments();

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        {HEADING}
      </h2>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !error && <SkeletonLines widths={['85%']} />}

      {page && !error && (
        <p style={screenExplanationStyle}>
          <RichText
            text={`Скриншот перевода присылайте **${page.contact}** в Telegram.`}
          />
        </p>
      )}
    </section>
  );
}
