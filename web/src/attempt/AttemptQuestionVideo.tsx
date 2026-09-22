// Видео-вопрос (ADR-0037: видео — ответ на конкретный вопрос, не вложение к
// попытке целиком). Раньше блок «Видео» стоял один на всю попытку на экране
// «Отправлено»; теперь и на форме сдачи, и на «Отправлено»
// (AttemptSubmittedVideos.tsx) у каждого видео-вопроса свои форма ссылки,
// кнопка бота и статус получения, поэтому два видео-вопроса в одной форме
// различимы, а ученик отвечает там же, где показан вопрос.
//
// Порядок блоков — ADR-0084 (уточняет ADR-0023): ссылка на видео стала
// основным путём ответа, бот остаётся вторым. Объяснение → подсказка про
// ссылку → раскрывающаяся инструкция «Как выложить видео» (AttemptVideoHowTo)
// → форма ссылки → кнопка бота тем, у кого Telegram привязан → «Связать
// Telegram» тем, кому есть что связывать. Заливка терракотой (правило
// акцента, docs/adr/0031) переехала с кнопки бота на «Сохранить ссылку»
// (AttemptMediaLinkForm.tsx) — одна на экран, просто у другого действия.
//
// Кнопка бота — только тем, у кого Telegram привязан (`telegramLinked`):
// бот привязывает видео по совпадению telegramId, и вошедшего по почте он
// не узнаёт. Инцидент 2026-09-16 (RUNBOOK §8.17): ученик сходил по кнопке,
// снял «кружок» и получил отказ — теперь такого пути с экрана просто нет.
// На его месте — «Связать Telegram» (ADR-0034): непривязанному предлагаем не
// обходной путь, а способ открыть бота короче ссылки. Условие — общий
// `showsTelegramLinkOffer` (`video.offersTelegramLink`), а не своё
// `!telegramLinked`: отметившему «у меня нет Telegram» (ADR-0067) звать
// некуда, а форма ссылки — его путь ответить в любом случае.
//
// Ответ уже есть или работу уже проверили — оба состояния живут в
// AttemptVideoAnswered.tsx (ADR-0086): форма ссылки там не прячется, потому
// что заменить ошибочную ссылку больше нечем, а у проверенной работы нет ни
// формы, ни бота — бэкенд ответа уже не примет.
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import { AttemptVideoAnswered } from './AttemptVideoAnswered';
import { AttemptVideoHowTo } from './AttemptVideoHowTo';
import {
  attemptVideoHintStyle,
  attemptVideoTelegramLinkStyle,
} from './attemptVideoStyles';
import { buildExamMediaTelegramLink } from './examMediaDeepLink';
import type { AttemptVideoControls } from './useAttemptMedia';

// Объяснение стоит до первого действия (CLAUDE.md «откуда это и зачем»):
// куда именно слать, говорят кнопка и подсказка ниже — они зависят от того,
// есть ли бот и привязан ли Telegram, а сама фраза от этого не меняется.
const VIDEO_ANSWER_EXPLANATION = 'Ответ на этот вопрос — видео.';
// Ссылка — основной путь (ADR-0084): подсказка стоит перед формой у всех, а
// не только у тех, кому не досталось бота.
const LINK_HINT =
  'Выложите запись на YouTube, во ВКонтакте, на Rutube или Яндекс.Диск и вставьте сюда ссылку.';
// Telegram к кабинету не привязан: объясняем, почему кнопки бота нет, и тут
// же даём связку (ADR-0034) — у человека остаётся способ короче ссылки, а не
// вопрос без ответа (docs/VOICE.md).
const TELEGRAM_NOT_LINKED_EXPLANATION =
  'Свяжите Telegram — и видео можно будет прислать боту одним сообщением.';

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

  if (received.length > 0 || !video.acceptsAnswers) {
    return <AttemptVideoAnswered itemId={itemId} video={video} received={received} />;
  }

  return (
    <>
      <AttemptQuestionVideoNote />
      <p style={attemptVideoHintStyle}>{LINK_HINT}</p>
      <AttemptVideoHowTo />
      <AttemptMediaLinkForm
        onSubmit={(url) => video.addMediaLink(itemId, url)}
        pending={pending}
        error={error}
      />

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

      {telegramBotUsername && video.offersTelegramLink && (
        <TelegramLinkButton explanation={TELEGRAM_NOT_LINKED_EXPLANATION} />
      )}
    </>
  );
}
