// Оплата за месяц на доске (ADR-0173): заголовок с месяцем, статус из трёх
// состояний (myPaymentLines.ts) и, пока оплаты нет, кому прислать скриншот —
// та же фраза, что в «Профиле» (PaymentContactLine.tsx). Кнопки загрузки нет:
// снимок уходит бухгалтеру напрямую (ADR-0159). Что показать, решает чистая
// boardPaymentView.ts. Ошибка загрузки — баннер внутри секции, остальной экран
// живёт. Показ только ученику решает BoardScreen.tsx
// (isPaymentContactVisible), здесь условия нет.
import type { CSSProperties } from 'react';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { blockCardStyle } from '../components/listCardStyles';
import { SkeletonLines } from '../components/Skeleton';
import { PaymentContactLine } from '../student/PaymentContactLine';
import { useMyPayments } from '../student/useMyPayments';
import { BoardSection } from './BoardSection';
import { boardPaymentView } from './boardPaymentView';

const LOADING_HEADING = 'Оплата';

const cardStyle: CSSProperties = {
  ...blockCardStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const statusStyle: CSSProperties = { margin: 0, fontWeight: 500 };

export function BoardPaymentCard() {
  const { page, loading, error, reload } = useMyPayments();
  const view = page && !error ? boardPaymentView(page) : null;

  return (
    <BoardSection heading={view?.heading ?? LOADING_HEADING}>
      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !error && <SkeletonLines widths={['40%', '70%']} />}

      {view && (
        <div style={cardStyle}>
          <p style={statusStyle}>{view.statusText}</p>
          {view.contact && <PaymentContactLine contact={view.contact} />}
        </div>
      )}
    </BoardSection>
  );
}
