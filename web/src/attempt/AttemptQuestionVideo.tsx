// Видео-вопрос (ADR-0037: видео — ответ на конкретный вопрос, не вложение к
// попытке целиком). Раньше блок «Видео» стоял один на всю попытку на экране
// «Отправлено»; теперь и на форме сдачи, и на «Отправлено»
// (AttemptSubmittedVideos.tsx) у каждого видео-вопроса свои кнопка бота,
// форма ссылки и статус получения, поэтому два видео-вопроса в одной форме
// различимы, а ученик отвечает там же, где показан вопрос.
// Кнопка бота — только тем, у кого Telegram привязан (`telegramLinked`):
// бот привязывает видео по совпадению telegramId, и вошедшего по почте он
// не узнаёт. Инцидент 2026-09-16 (RUNBOOK §8.17): ученик сходил по кнопке,
// снял «кружок» и получил отказ — теперь такого пути с экрана просто нет.
// На его месте — «Связать Telegram» (ADR-0034): непривязанному предлагаем не
// обходной путь, а способ открыть основной.
// Видео уже получено — вместо формы честная строка, что и когда пришло:
// показать форму заново после того, как всё уже сделано, читается как
// «кабинет не поверил», что противоречит Read-after-write (CLAUDE.md).
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import {
  attemptVideoHintStyle,
  attemptVideoReceivedListStyle,
  attemptVideoTelegramLinkStyle,
} from './attemptVideoStyles';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';
import type { AttemptVideoControls } from './useAttemptMedia';

// Объяснение стоит до первого действия (CLAUDE.md «откуда это и зачем»):
// куда именно слать, говорят кнопка и подсказка ниже — они зависят от того,
// есть ли бот и привязан ли Telegram, а сама фраза от этого не меняется.
const VIDEO_ANSWER_EXPLANATION =
  'Ответ на этот вопрос — видео: снимите, как вы выполняете задание, и пришлите запись.';
const FALLBACK_HINT =
  'Нет Telegram — оставьте ссылку на видео: VK Видео, Rutube или Яндекс.Диск.';
// Telegram к кабинету не привязан: объясняем, почему кнопки бота нет, и тут
// же даём связку (ADR-0034) — человек не гадает и не остаётся с одним
// запасным путём (docs/VOICE.md).
const TELEGRAM_NOT_LINKED_EXPLANATION =
  'Бот в Telegram узнаёт вас по аккаунту, а вы вошли по почте. Свяжите его — и запись уйдёт одним сообщением.';

/** Объяснение видео-вопроса без кнопок и формы — для предпросмотра учителя
 * (exams/ExamPreviewQuestion.tsx): там отвечать нельзя, но зачем нужно
 * видео, видно тем же текстом, что и ученику. */
export function AttemptQuestionVideoNote() {
  return <p style={{ margin: 0 }}>{VIDEO_ANSWER_EXPLANATION}</p>;
}

interface AttemptQuestionVideoProps {
  itemId: string;
  video: AttemptVideoControls;
}

export function AttemptQuestionVideo({ itemId, video }: AttemptQuestionVideoProps) {
  const received = video.media.filter((item) => item.itemId === itemId);
  const { telegramBotUsername } = video;
  const { pending, error } = video.linkStateFor(itemId);

  if (received.length > 0) {
    return (
      <ul style={attemptVideoReceivedListStyle}>
        {received.map((item) => (
          <li key={item.id}>{formatExamMediaReceivedAt(item)}.</li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <AttemptQuestionVideoNote />

      {telegramBotUsername && video.telegramLinked && (
        <a
          href={buildExamMediaTelegramLink(telegramBotUsername, video.attemptId, itemId)}
          target="_blank"
          rel="noopener noreferrer"
          style={attemptVideoTelegramLinkStyle}
        >
          Отправить видео боту в Telegram
        </a>
      )}

      {telegramBotUsername && !video.telegramLinked && (
        <TelegramLinkButton explanation={TELEGRAM_NOT_LINKED_EXPLANATION} />
      )}

      <p style={attemptVideoHintStyle}>{FALLBACK_HINT}</p>
      <AttemptMediaLinkForm
        onSubmit={(url) => video.addMediaLink(itemId, url)}
        pending={pending}
        error={error}
      />
    </>
  );
}
