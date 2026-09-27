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
// Telegram» тем, кому есть что связывать. У видео-вопроса больше нет ни одной
// заливки терракотой (правило акцента, docs/adr/0031): ADR-0136 убрал кнопку
// «Сохранить ссылку» вместе с ней — ссылка сохраняет себя сама.
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
import { RichText } from '../components/RichText';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import { AttemptVideoAnswered } from './AttemptVideoAnswered';
import { AttemptVideoHowTo } from './AttemptVideoHowTo';
import { AttemptVideoUpload } from './AttemptVideoUpload';
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
// Ссылка — основной путь там, где нет своей загрузки файлом (ADR-0084):
// подсказка стоит перед формой у всех, а не только у тех, кому не досталось
// бота. С ADR-0136 добавлено, что нажимать после вставки уже нечего — ссылка
// сохраняется сама.
const LINK_HINT_PRIMARY =
  'Выложите запись на YouTube, во ВКонтакте, на Rutube или Яндекс.Диск и ' +
  '**вставьте сюда ссылку** — она сохранится сама.';
// Загрузка файлом стала первым путём (ADR-0137) — ссылка становится вторым,
// для уже выложенной где-то записи, а не единственным способом ответить.
const LINK_HINT_SECONDARY =
  'Запись уже выложена на YouTube, во ВКонтакте или ещё где-то? ' +
  '**Вставьте сюда ссылку** — она сохранится сама.';
// Кнопка бота вела в чат, но не объясняла, что там будет: отзыв
// тестера 2026-09-27, «не очень понятно, что такое „Отправить видео
// боту в Telegram“» (ADR-0136). Текст правдив: бот на этой ссылке
// (exam-question-screen.ts, VIDEO_QUESTION_PROMPT) действительно просит
// прислать видео следующим сообщением и сам прикладывает его к вопросу.
const BOT_BUTTON_EXPLANATION =
  'Видео уже в телефоне? Можно никуда не выкладывать: **пришлите его боту ' +
  'школы** в Telegram — оно само прикрепится к этому вопросу.';
// Telegram к кабинету не привязан: объясняем, почему кнопки бота нет, и тут
// же даём связку (ADR-0034) — у человека остаётся способ короче ссылки, а не
// вопрос без ответа (docs/VOICE.md).
const TELEGRAM_NOT_LINKED_EXPLANATION =
  'Свяжите Telegram — и видео можно будет прислать боту **одним сообщением**.';

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

      {/* Загрузка файлом — первый путь там, где подключён R2 (ADR-0137);
          без него экран остаётся прежним (ссылка → инструкция → бот). */}
      {video.fileUploadEnabled && <AttemptVideoUpload itemId={itemId} video={video} />}

      <p style={attemptVideoHintStyle}>
        <RichText
          text={video.fileUploadEnabled ? LINK_HINT_SECONDARY : LINK_HINT_PRIMARY}
        />
      </p>
      <AttemptVideoHowTo />
      <AttemptMediaLinkForm
        onSubmit={(url) => video.addMediaLink(itemId, url)}
        pending={pending}
        error={error}
      />

      {telegramBotUsername && video.telegramLinked && (
        <>
          <p style={attemptVideoHintStyle}>
            <RichText text={BOT_BUTTON_EXPLANATION} />
          </p>
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
            Открыть чат с ботом
          </a>
        </>
      )}

      {telegramBotUsername && video.offersTelegramLink && (
        <TelegramLinkButton explanation={TELEGRAM_NOT_LINKED_EXPLANATION} />
      )}
    </>
  );
}
