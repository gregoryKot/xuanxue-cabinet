// «Оплаты» — абонементы учеников по месяцам для бухгалтера и админа
// (docs/PLAN.md §15, ADR-0049, ADR-0151). Экран отвечает на один вопрос:
// кто ждёт подтверждения. Сверху те, кто прислал снимок, ниже оплатившие и
// молчащие. Логика — в usePayments.ts, группировка — в groupPaymentRows.ts.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { groupPaymentRows } from './groupPaymentRows';
import { PaymentGroupList } from './PaymentGroupList';
import { PaymentMonthSwitcher } from './PaymentMonthSwitcher';
import { usePayments } from './usePayments';

const TITLE = 'Оплаты';
const EXPLANATION =
  'Здесь абонементы по месяцам. Подтвердите перевод — ученик увидит **«оплачено»** у себя.';
const EMPTY_MESSAGE =
  'Учеников пока нет — строки появятся, когда кто-то войдёт по **ссылке-приглашению**.';

export default function PaymentsScreen() {
  const { page, month, loading, error, reload, selectMonth, confirm, revoke } =
    usePayments();
  const isReady = !loading && !error && page !== null;

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      <PaymentMonthSwitcher
        month={month}
        disabled={loading}
        onSelect={(next) => void selectMonth(next)}
      />

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && <SkeletonList rows={4} h={72} />}

      {isReady && page.rows.length === 0 && (
        <p style={{ margin: 0 }}>
          <RichText text={EMPTY_MESSAGE} />
        </p>
      )}

      {isReady &&
        groupPaymentRows(page.rows).map((group) => (
          <PaymentGroupList
            key={group.status}
            group={group}
            onConfirm={confirm}
            onRevoke={revoke}
          />
        ))}
    </section>
  );
}
