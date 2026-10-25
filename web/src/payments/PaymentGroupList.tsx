// Одна группа экрана «Оплаты»: заголовок и список одной карточкой, строки
// делит линия (`oneCardListStyle`, как у «Учеников»).
import type { CSSProperties } from 'react';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenColumnTitleStyle } from '../components/screenLayout';
import type { PaymentGroup } from './groupPaymentRows';
import { PaymentRow } from './PaymentRow';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

interface PaymentGroupListProps {
  group: PaymentGroup;
  onConfirm: (userId: string, month: string) => Promise<void>;
  onRevoke: (userId: string, month: string) => Promise<void>;
}

export function PaymentGroupList({ group, onConfirm, onRevoke }: PaymentGroupListProps) {
  return (
    <div style={groupStyle}>
      <h2 style={screenColumnTitleStyle}>{group.title}</h2>
      <ul style={oneCardListStyle}>
        {group.rows.map((row, index) => (
          <PaymentRow
            key={row.userId}
            row={row}
            onConfirm={() => onConfirm(row.userId, row.month)}
            onRevoke={() => onRevoke(row.userId, row.month)}
            isLast={index === group.rows.length - 1}
          />
        ))}
      </ul>
    </div>
  );
}
