// Блок «Абонемент» на экране «Профиль» (PLAN §15, слой 2.4): месяц и одно из
// трёх состояний — оплачено, ждём подтверждения, оплаты нет. Заголовок —
// рубрика `.xuanxue-eyebrow`, не второй `<h1>` (как у NotificationPrefsSection).
// Строки считает чистый myPaymentLines.ts; здесь только раскладка и выбор
// «бот или загрузка файла» (MyPaymentScreenshotAction.tsx).
import type { CSSProperties } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { useAuthConfig } from '../auth/useAuthConfig';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { dividedListStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { noteStyle, screenExplanationStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { MyPaymentScreenshotAction } from './MyPaymentScreenshotAction';
import { myPaymentLines, type MonthLine } from './myPaymentLines';
import { useMyPayments } from './useMyPayments';

const HEADING = 'Абонемент';
const OTHERS_HEADING = 'Другие месяцы';
const EMPTY_HISTORY = 'Пока ничего нет';
const EXPLANATION =
  'Оплату отмечает **школа**, когда видит ваш перевод. ' +
  'Скриншот не обязателен — пришлите, если хотите показать чек сами.';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>`/`<h3>` свои отступы от браузера — расстояние держит `gap` колонки.
const headingStyle: CSSProperties = { margin: 0 };
// Название месяца и статус — колонкой: на 360 px две строки в одну линию с
// переносом читались бы кашей.
const lineStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const titleStyle: CSSProperties = { fontWeight: 500 };
const statusStyle: CSSProperties = { color: 'var(--ink-soft)' };
const historyRowStyle: CSSProperties = {
  ...lineStyle,
  padding: '12px 0',
  borderBottom: '1px solid var(--line)',
};

function MonthText({ line }: { line: MonthLine }) {
  return (
    <>
      <span style={titleStyle}>{line.title}</span>
      <span style={statusStyle}>{line.text}</span>
    </>
  );
}

interface MyPaymentsSectionProps {
  me: MeDto;
}

export function MyPaymentsSection({ me }: MyPaymentsSectionProps) {
  const { page, loading, error, reload, uploadScreenshot, uploading, uploadError } =
    useMyPayments();
  const { config } = useAuthConfig();
  const lines = page ? myPaymentLines(page) : null;

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {HEADING}
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !error && <SkeletonList rows={2} h={56} />}

      {lines && !error && (
        <>
          <div style={lineStyle}>
            <MonthText line={lines.current} />
          </div>
          {lines.current.canSendScreenshot && (
            <MyPaymentScreenshotAction
              me={me}
              telegramBotUsername={config?.telegramBotUsername}
              month={lines.current.month}
              uploading={uploading}
              uploadError={uploadError}
              onFile={(month, file) => void uploadScreenshot(month, file)}
            />
          )}

          <h3 className="xuanxue-eyebrow" style={headingStyle}>
            {OTHERS_HEADING}
          </h3>
          {lines.others.length === 0 ? (
            <p style={noteStyle}>{EMPTY_HISTORY}</p>
          ) : (
            <ul style={dividedListStyle}>
              {lines.others.map((line) => (
                <li key={line.month} style={historyRowStyle}>
                  <MonthText line={line} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
