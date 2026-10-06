// Снимок перевода в строке оплат (ADR-0149). Байты кабинета (`upload`)
// раскрываются на месте картинкой, без оверлея: лист поверх экрана потребовал
// бы useHistorySheet, а «Показать» строке хватает. Снимок из бота
// (`telegram`) кабинет не хранит — у нас только file_id, копия ушла
// бухгалтеру в Telegram, поэтому вместо картинки тихая строка, куда смотреть.
import { useState, type CSSProperties } from 'react';
import { formatMonthRu, type PaymentDto } from '@xuanxue/shared';
import { paymentScreenshotSrc } from '../api/paymentsApiPaths';
import { noteStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';

const TELEGRAM_NOTE = 'Снимок прислали боту — он в Telegram, в чате с ботом';

const imageStyle: CSSProperties = {
  display: 'block',
  maxWidth: '100%',
  borderRadius: 'var(--radius-control)',
};

export function PaymentScreenshot({ row }: { row: PaymentDto }) {
  const [open, setOpen] = useState(false);

  if (row.screenshotKind === 'telegram') return <p style={noteStyle}>{TELEGRAM_NOTE}</p>;
  if (row.screenshotKind !== 'upload') return null;

  return (
    <div>
      <TextLinkButton aria-expanded={open} onClick={() => setOpen((prev) => !prev)}>
        {open ? 'Скрыть снимок' : 'Показать снимок'}
      </TextLinkButton>
      {open && (
        <img
          src={paymentScreenshotSrc(row.userId, row.month)}
          alt={`Снимок перевода: ${row.userName}, ${formatMonthRu(row.month)}`}
          style={imageStyle}
        />
      )}
    </div>
  );
}
