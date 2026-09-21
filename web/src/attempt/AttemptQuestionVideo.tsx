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
// обходной путь, а способ открыть основной. Условие — общий
// `showsTelegramLinkOffer` (`video.offersTelegramLink`), а не своё
// `!telegramLinked`: отметившему «у меня нет Telegram» (ADR-0067) звать
// некуда, и до этой правки видео-вопрос оставался единственным местом, где
// кабинет звал его всё равно. Запасной путь у него остаётся — форма ссылки
// ниже, ради неё предложение и уступает.
// Видео уже получено — форма ссылки не прячется (ADR-0084): ошибочно
// прикреплённую ссылку убрать может только сама замена, отдельного
// «удалить» нет. Список полученного идёт первым, форма ссылки — под ним, с
// подписью, что новая ссылка заменит прежнюю. Кнопка бота и предложение
// связать Telegram при этом не показываются — видео из Telegram заменить
// нельзя (их может быть несколько на один вопрос, ADR-0023), и звать туда
// второй раз незачем.
// Работу уже проверили (`acceptsAnswers: false`, ADR-0084) — ни формы, ни
// кнопки бота: бэкенд такую ссылку не примет, а контрол, который всегда
// отвечает отказом, хуже, чем его отсутствие — ровно та болезнь, от которой
// лечит этот ADR.
import { EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE } from '@xuanxue/shared';
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
// Видео уже получено (ADR-0084) — форма остаётся единственным способом
// исправить ошибку: подпись объясняет, что новая ссылка заменит прежнюю, а
// не добавится к ней.
const REPLACE_LINK_HINT = 'Прислали не ту ссылку? Вставьте новую — она заменит прежнюю.';
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
  const hasReceived = received.length > 0;
  const { telegramBotUsername } = video;
  const { pending, error } = video.linkStateFor(itemId);

  return (
    <>
      {hasReceived ? (
        <ul style={attemptVideoReceivedListStyle}>
          {received.map((item) => (
            <li key={item.id}>{formatExamMediaReceivedAt(item)}.</li>
          ))}
        </ul>
      ) : (
        <AttemptQuestionVideoNote />
      )}

      {video.acceptsAnswers &&
        !hasReceived &&
        telegramBotUsername &&
        video.telegramLinked && (
          <a
            href={buildExamMediaTelegramLink(
              telegramBotUsername,
              video.attemptId,
              itemId,
            )}
            target="_blank"
            rel="noopener noreferrer"
            style={attemptVideoTelegramLinkStyle}
          >
            Отправить видео боту в Telegram
          </a>
        )}

      {video.acceptsAnswers &&
        !hasReceived &&
        telegramBotUsername &&
        video.offersTelegramLink && (
          <TelegramLinkButton explanation={TELEGRAM_NOT_LINKED_EXPLANATION} />
        )}

      {video.acceptsAnswers ? (
        <>
          <p style={attemptVideoHintStyle}>
            {hasReceived ? REPLACE_LINK_HINT : FALLBACK_HINT}
          </p>
          <AttemptMediaLinkForm
            onSubmit={(url) => video.addMediaLink(itemId, url)}
            pending={pending}
            error={error}
          />
        </>
      ) : (
        <p style={attemptVideoHintStyle}>{EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE}</p>
      )}
    </>
  );
}
