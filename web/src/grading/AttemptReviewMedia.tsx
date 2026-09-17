// Блок «Видео» карточки проверки (ADR-0023, ТЗ п.4.5/4.6) — что получено и
// когда, своя строка на каждый способ: `link` открывается сама, `telegram`
// и `manual` — текстом (describeMediaSource). Видео нет вовсе — кнопка
// «Отметить, что видео принято» (третий путь ADR-0023): учитель мог
// получить его другим способом и должен иметь возможность закрыть случай,
// не дожидаясь, пока ученик разберётся с Telegram или со ссылкой. Строка
// списка, не карточка (направление «тихо и благородно», docs/adr/0031) —
// та же волосяная линия, что у вопроса (AttemptReviewQuestion.tsx). Ссылка —
// textLinkStyle (screenLayout.ts): у `<a>` нет своей строки в index.css,
// без явного цвета браузер красит её системным синим.
import type { CSSProperties } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError, type FormError } from '../components/FormServerError';
import { textLinkStyle } from '../components/screenLayout';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { describeMediaSource } from './examMediaSourceText';

const NO_MEDIA_TEXT = 'Видео пока не получено.';
const titleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 20,
};
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const itemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '14px 4px',
  borderBottom: '1px solid var(--line)',
};
const sourceTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface AttemptReviewMediaProps {
  media: ExamMediaDto[];
  onMarkManual: () => Promise<boolean>;
  marking: boolean;
  markError: FormError | null;
}

export function AttemptReviewMedia({
  media,
  onMarkManual,
  marking,
  markError,
}: AttemptReviewMediaProps) {
  return (
    <section>
      <h3 style={titleStyle}>Видео</h3>

      {media.length === 0 ? (
        <>
          <p style={{ margin: '0 0 8px' }}>{NO_MEDIA_TEXT}</p>
          <Button
            variant="secondary"
            pending={marking}
            onClick={() => void onMarkManual()}
          >
            Отметить, что видео принято
          </Button>
          <FormServerError error={markError} />
        </>
      ) : (
        <ul style={listStyle}>
          {media.map((item) => (
            <li key={item.id} style={itemStyle}>
              <p style={{ margin: 0 }}>{formatExamMediaReceivedAt(item)}.</p>
              {item.kind === 'link' && item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...textLinkStyle, alignSelf: 'flex-start' }}
                >
                  Открыть ссылку на видео
                </a>
              ) : (
                <p style={sourceTextStyle}>{describeMediaSource(item)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
