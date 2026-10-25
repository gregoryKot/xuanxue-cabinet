// Плитка оплаты за месяц на главной (ADR-0173, плитка — ADR-0178): заголовок
// с месяцем, статус из трёх состояний (myPaymentLines.ts) и, пока оплаты нет,
// кому прислать скриншот — та же фраза, что в «Профиле» (PaymentContactLine.tsx).
// Кнопки загрузки нет: снимок уходит бухгалтеру напрямую (ADR-0159). Что
// показать, решает чистая boardPaymentView.ts; показ только ученику —
// isPaymentContactVisible в useStudentHome.ts.
import type { CSSProperties } from 'react';
import { PaymentContactLine } from '../student/PaymentContactLine';
import { BoardTile } from './BoardTile';
import type { BoardPaymentView } from './boardPaymentView';

const statusStyle: CSSProperties = { margin: 0, fontWeight: 500 };

interface BoardPaymentTileProps {
  view: BoardPaymentView;
}

export function BoardPaymentTile({ view }: BoardPaymentTileProps) {
  return (
    <BoardTile title={view.heading}>
      <p style={statusStyle}>{view.statusText}</p>
      {view.contact && <PaymentContactLine contact={view.contact} />}
    </BoardTile>
  );
}
