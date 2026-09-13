// Блок «Видео» карточки проверки (ADR-0023, ТЗ п.4.5/4.6) — что получено и
// когда, своя строка на каждый способ: `link` открывается сама, `telegram`
// и `manual` — текстом (describeMediaSource). Видео нет вовсе — кнопка
// «Отметить, что видео принято» (третий путь ADR-0023): учитель мог
// получить его другим способом и должен иметь возможность закрыть случай,
// не дожидаясь, пока ученик разберётся с Telegram или со ссылкой.
import type { CSSProperties } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError, type FormError } from '../components/FormServerError';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { describeMediaSource } from './examMediaSourceText';

const NO_MEDIA_TEXT = 'Видео пока не получено.';
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
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
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Видео</h3>

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
            <li key={item.id}>
              <p style={{ margin: 0 }}>{formatExamMediaReceivedAt(item)}.</p>
              {item.kind === 'link' && item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
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
