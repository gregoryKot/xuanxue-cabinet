// Строка оплат: имя и статус слева, одно действие справа — какое, решает
// статус. Киноварь (primary) на экране только у «Подтвердить»: ради этого
// действия экран и открывают. «Отметить оплату» у неоплатившего — вторичная
// кнопка: Маша видит перевод в выписке и отмечает его сама (ADR-0049).
import type { CSSProperties } from 'react';
import type { PaymentDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { dangerNoteStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { PaymentScreenshot } from './PaymentScreenshot';
import { paymentStatusText } from './paymentRowText';
import { usePaymentRowAction } from './usePaymentRowAction';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 20px',
};
// Имя, статус и кнопка переносятся строками, а не сжимаются: на 360 px рядом
// им тесно, горизонтального скролла быть не должно.
const topLineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
};
const identityStyle: CSSProperties = { flex: '1 1 180px', minWidth: 0 };
const nameStyle: CSSProperties = { ...listCardTitleStyle, overflowWrap: 'anywhere' };

interface PaymentRowProps {
  row: PaymentDto;
  onConfirm: () => Promise<void>;
  onRevoke: () => Promise<void>;
  /** Последняя строка общей карточки списка — без нижней линии. */
  isLast: boolean;
}

export function PaymentRow({ row, onConfirm, onRevoke, isLast }: PaymentRowProps) {
  const { pending, error, run } = usePaymentRowAction();

  return (
    <li style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <div style={topLineStyle}>
        <div style={identityStyle}>
          <div style={nameStyle}>{row.userName}</div>
          <div style={listCardMetaStyle}>{paymentStatusText(row)}</div>
        </div>

        {row.status === 'awaiting' && (
          <Button disabled={pending} onClick={() => void run(onConfirm)}>
            Подтвердить
          </Button>
        )}
        {row.status === 'unpaid' && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => void run(onConfirm)}
          >
            Отметить оплату
          </Button>
        )}
        {row.status === 'paid' && (
          <TextLinkButton disabled={pending} onClick={() => void run(onRevoke)}>
            Снять подтверждение
          </TextLinkButton>
        )}
      </div>

      <PaymentScreenshot row={row} />

      {error && (
        <p style={dangerNoteStyle} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
