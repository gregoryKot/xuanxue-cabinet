// Блок «Видео» на экране «Отправлено» (ADR-0023, ТЗ п.1) — объясняет, зачем
// нужно видео, и даёт два пути: deep link в чат с ботом (основной путь
// ADR-0023) и форма со ссылкой (запасной — для тех, у кого нет Telegram).
// Кнопка бота — только тем, у кого Telegram привязан (`telegramLinked`):
// бот привязывает видео по совпадению telegramId, и вошедшего по почте он
// не узнаёт. Инцидент 2026-09-16 (RUNBOOK §8.17): ученик сходил по кнопке,
// снял «кружок» и получил отказ — теперь такого пути с экрана просто нет.
// На его месте — «Связать Telegram» (ADR-0034): непривязанному предлагаем не
// обходной путь, а способ открыть основной.
// Видео уже получено — вместо формы честная строка, что и когда пришло:
// показать форму заново после того, как всё уже сделано, читается как
// «кабинет не поверил», что противоречит Read-after-write (CLAUDE.md).
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';

const EXPLANATION =
  'Учитель смотрит форму по видео — пришлите запись, как вы её выполнили.';
const FALLBACK_HINT = 'Нет Telegram — оставьте ссылку на видео.';
// Telegram к кабинету не привязан: объясняем, почему кнопки бота нет, и тут
// же даём связку (ADR-0034) — человек не гадает и не остаётся с одним
// запасным путём (docs/VOICE.md).
const TELEGRAM_NOT_LINKED_EXPLANATION =
  'Бот в Telegram узнаёт вас по аккаунту, а вы вошли по почте. Свяжите его — и запись уйдёт одним сообщением.';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};
// Заголовок блока антиквой, но заметно легче названия экзамена
// (screenTitleStyle, 34): внутри экрана это раздел, а не второй экран.
const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: 22,
  lineHeight: 1.1,
};
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
// Единственная киноварь на этом экране (правило акцента, docs/adr/0031):
// прислать видео — то, ради чего ученик сюда вернулся.
const telegramLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 18px',
  borderRadius: 3,
  fontWeight: 600,
  background: 'var(--cinnabar)',
  color: 'var(--cinnabar-contrast)',
  textDecoration: 'none',
  alignSelf: 'flex-start',
};

interface AttemptMediaPromptProps {
  attempt: ExamAttemptDto;
  /** Нет бота или Telegram не ответил при старте (GET /auth/config без
   * поля) — кнопки в чат с ботом не будет, а не ссылка на «undefined». */
  telegramBotUsername?: string;
  /** Привязан ли Telegram к аккаунту (`MeDto.telegramLinked`) — без него бот
   * видео не примет, кнопка вела бы в тупик (см. комментарий вверху файла). */
  telegramLinked: boolean;
  onAddMediaLink: (url: string) => Promise<boolean>;
  addingMediaLink: boolean;
  addMediaLinkError: FormError | null;
}

export function AttemptMediaPrompt({
  attempt,
  telegramBotUsername,
  telegramLinked,
  onAddMediaLink,
  addingMediaLink,
  addMediaLinkError,
}: AttemptMediaPromptProps) {
  const media = attempt.media ?? [];
  const botLink = telegramBotUsername && telegramLinked;

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

          {botLink && (
            <a
              href={buildExamMediaTelegramLink(telegramBotUsername, attempt.id)}
              target="_blank"
              rel="noopener noreferrer"
              style={telegramLinkStyle}
            >
              Отправить видео боту в Telegram
            </a>
          )}

          {telegramBotUsername && !telegramLinked && (
            <TelegramLinkButton explanation={TELEGRAM_NOT_LINKED_EXPLANATION} />
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
