// Блок «Видео» на экране «Отправлено» (ADR-0023, ТЗ п.1) — объясняет, зачем
// нужно видео, и даёт два пути: deep link в чат с ботом (основной путь
// ADR-0023) и форма со ссылкой (запасной — для тех, у кого нет Telegram).
// Видео уже получено — вместо формы честная строка, что и когда пришло:
// показать форму заново после того, как всё уже сделано, читается как
// «кабинет не поверил», что противоречит Read-after-write (CLAUDE.md).
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';

const EXPLANATION =
  'Учитель смотрит форму по видео — пришлите запись, как вы её выполнили.';
const FALLBACK_HINT = 'Нет Telegram — оставьте ссылку на видео.';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headingStyle: CSSProperties = { margin: 0, fontSize: 16 };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const receivedListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
// Визуально — как Button variant="primary" (components/Button.tsx), но это
// переход по внешней ссылке (t.me), не действие в кабинете: <a>, не
// <button> (тот же приём, что StudentLessonMeeting.tsx: zoomLinkStyle).
const telegramLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 18px',
  borderRadius: 8,
  fontWeight: 600,
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  textDecoration: 'none',
  alignSelf: 'flex-start',
};

interface AttemptMediaPromptProps {
  attempt: ExamAttemptDto;
  /** Нет бота или Telegram не ответил при старте (GET /auth/config без
   * поля) — кнопки в чат с ботом не будет, а не ссылка на «undefined». */
  telegramBotUsername?: string;
  onAddMediaLink: (url: string) => Promise<boolean>;
  addingMediaLink: boolean;
  addMediaLinkError: FormError | null;
}

export function AttemptMediaPrompt({
  attempt,
  telegramBotUsername,
  onAddMediaLink,
  addingMediaLink,
  addMediaLinkError,
}: AttemptMediaPromptProps) {
  const media = attempt.media ?? [];

  return (
    <section style={sectionStyle}>
      <h2 style={headingStyle}>Видео</h2>

      {media.length > 0 ? (
        <ul style={receivedListStyle}>
          {media.map((item) => (
            <li key={item.id}>{formatExamMediaReceivedAt(item)}.</li>
          ))}
        </ul>
      ) : (
        <>
          <p style={{ margin: 0 }}>{EXPLANATION}</p>

          {telegramBotUsername && (
            <a
              href={buildExamMediaTelegramLink(telegramBotUsername, attempt.id)}
              target="_blank"
              rel="noopener noreferrer"
              style={telegramLinkStyle}
            >
              Отправить видео боту в Telegram
            </a>
          )}

          <p style={hintStyle}>{FALLBACK_HINT}</p>
          <AttemptMediaLinkForm
            onSubmit={onAddMediaLink}
            pending={addingMediaLink}
            error={addMediaLinkError}
          />
        </>
      )}
    </section>
  );
}
