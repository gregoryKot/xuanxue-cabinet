// Одна запись видео в списке AttemptReviewMedia.tsx — вынесена своим файлом,
// чтобы список не выходил за файловый лимит (CLAUDE.md «Храповики», 150
// строк): у записи `kind: 'telegram'` теперь есть кнопка и два состояния
// (успех/ошибка), а не только строка текста.
//
// «Прислать мне в Telegram» — второй способ учителю увидеть видео, кроме
// пересылки в момент получения (ADR-0023): та уходит только тем, у кого чат
// с ботом уже был именно в тот момент, поэтому открывший карточку позже или
// другой учитель/ассистент, заводивший чат после, видео у себя не находит.
// Кнопка шлёт запись туда же ещё раз отдельным запросом
// (POST .../media/:mediaId/send-to-me, контракт бэкенда, useAttemptReview.ts).
//
// Активный чат — `botChatActive` (MeDto), считанный один раз в
// AttemptReviewScreen.tsx через useAuth() и переданный вниз готовым булевым
// полем AttemptReviewVideoControls — тот же приём, что offersTelegramLink в
// attempt/useAttemptMedia.ts: сессия живёт у экрана, запись видео о ней не
// знает. Без чата кнопки нет вовсе (эндпоинт ответил бы 409) — вместо неё
// честное объяснение и, если есть что предложить (showsTelegramOffer,
// ADR-0042/ADR-0067), переиспользованная TelegramLinkButton — не вторая
// копия той же кнопки (CLAUDE.md «Одна механика — один компонент»).
//
// Успех не перечитывает карточку: на сервере ничего не изменилось, поменялся
// чат в Telegram (CLAUDE.md «Read-after-write» здесь неприменим буквально) —
// короткая строка вместо кнопки, состояние целиком на клиенте (sendState в
// useAttemptReview.ts). Ошибка — FormServerError под кнопкой, тот же приём,
// что у ручной отметки в AttemptReviewMedia.tsx.
import type { CSSProperties } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError, type FormError } from '../components/FormServerError';
import { textLinkStyle } from '../components/screenLayout';
import { VideoEmbed } from '../components/VideoEmbed';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { TELEGRAM_CHAT_EXPLANATION } from '../telegram/telegramChatExplanation';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { describeMediaSource } from './examMediaSourceText';

const itemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '14px 4px',
  borderBottom: '1px solid var(--line)',
};
// Ссылка показывается адресом, а не словами «Открыть ссылку на видео»: по
// безымянной строке не видно, куда она ведёт — YouTube там, Яндекс.Диск или
// чужая страница (снимок владельца 2026-09-21). Адрес целиком, с переносом
// по любому символу: у видео бывают длинные пути, а карточка проверки
// открывается и с телефона (CLAUDE.md «Мобильный экран первым»).
const videoLinkStyle: CSSProperties = {
  ...textLinkStyle,
  alignSelf: 'flex-start',
  overflowWrap: 'anywhere',
};
const sourceTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

const SEND_BUTTON_LABEL = 'Прислать мне в Telegram';
// VOICE: короткая строка, куда идти смотреть — без обещания, что видео уже
// там до клика (это и была ошибка старого текста describeMediaSource).
const SEND_SUCCESS_TEXT = 'Видео в чате с ботом — откройте Telegram.';
// Чата нет — кнопки нет (эндпоинт ответил бы 409): объясняем, откуда
// возьмётся видео, вместо тупика.
const NO_CHAT_EXPLANATION = 'Бот пришлёт видео, когда у вас будет открыт чат с ним.';

interface AttemptReviewMediaItemProps {
  item: ExamMediaDto;
  onSendToMe: () => Promise<boolean>;
  sending: boolean;
  sendError: FormError | null;
  sent: boolean;
  botChatActive: boolean;
  offersTelegramLink: boolean;
}

export function AttemptReviewMediaItem({
  item,
  onSendToMe,
  sending,
  sendError,
  sent,
  botChatActive,
  offersTelegramLink,
}: AttemptReviewMediaItemProps) {
  return (
    <li style={itemStyle}>
      <p style={{ margin: 0 }}>{formatExamMediaReceivedAt(item)}.</p>
      {item.kind === 'link' && item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={videoLinkStyle}
        >
          {item.url}
        </a>
      )}
      {/* Плеер под ссылкой (ADR-0100) — смотреть, не уходя с карточки
          проверки; ссылка остаётся, см. комментарий там же. */}
      {item.kind === 'link' && item.url && (
        <VideoEmbed url={item.url} title="Запись ученика" />
      )}
      {item.kind === 'telegram' && (
        <>
          <p style={sourceTextStyle}>{describeMediaSource(item)}</p>
          {botChatActive ? (
            sent ? (
              <p style={sourceTextStyle}>{SEND_SUCCESS_TEXT}</p>
            ) : (
              <>
                <Button
                  variant="secondary"
                  pending={sending}
                  onClick={() => void onSendToMe()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {SEND_BUTTON_LABEL}
                </Button>
                <FormServerError error={sendError} />
              </>
            )
          ) : offersTelegramLink ? (
            <TelegramLinkButton
              explanation={TELEGRAM_CHAT_EXPLANATION}
              variant="secondary"
            />
          ) : (
            <p style={sourceTextStyle}>{NO_CHAT_EXPLANATION}</p>
          )}
        </>
      )}
      {item.kind === 'manual' && (
        <p style={sourceTextStyle}>{describeMediaSource(item)}</p>
      )}
    </li>
  );
}
