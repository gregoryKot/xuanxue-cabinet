// Кнопка «Открыть чат с ботом» на экране видео-вопроса
// (AttemptQuestionVideo.tsx) — второй путь ответа после ссылки (ADR-0084).
//
// В предпросмотре «глазами ученика» (`disabled`) это не ссылка, а `<span>` того
// же вида: у `<a>` без `href` нет роли «ссылка» ни для клавиатуры, ни для
// скринридера (jsx-a11y/anchor-is-valid), а настоящий адрес с выдуманным
// номером попытки открыл бы бота зря. Учитель видит ту же кнопку, что ученик
// (отзыв владельца 2026-10-02), но нажать её нельзя.
import { attemptVideoTelegramLinkStyle } from './attemptVideoStyles';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';

const LABEL = 'Открыть чат с ботом';

interface AttemptBotLinkProps {
  telegramBotUsername: string;
  attemptId: string;
  itemId: string;
  /** Предпросмотр учителя: тот же вид, но без перехода. */
  disabled?: boolean;
}

export function AttemptBotLink({
  telegramBotUsername,
  attemptId,
  itemId,
  disabled,
}: AttemptBotLinkProps) {
  if (disabled) return <span style={attemptVideoTelegramLinkStyle}>{LABEL}</span>;

  return (
    <a
      href={buildExamMediaTelegramLink(telegramBotUsername, attemptId, itemId)}
      target="_blank"
      rel="noopener noreferrer"
      style={attemptVideoTelegramLinkStyle}
    >
      {LABEL}
    </a>
  );
}
