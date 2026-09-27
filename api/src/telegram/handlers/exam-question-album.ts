// Медиа вопроса и вариантов ответа — картинки (ADR-0035) и видео (ADR-0133,
// «Уточнено» 2026-09-27: бот теперь сам показывает клип, не только пишет,
// что он есть) вперемешку, одним списком в порядке: видео самой
// формулировки вопроса первым, затем по каждому варианту — картинка или
// видео, если есть, в порядке вариантов. Один проход, не два отдельных
// (картинки, потом видео) — у вариантов встречаются оба типа вперемешку, и
// раздельные проходы отправили бы клип варианта Б раньше картинки варианта А,
// хотя А идёт первым. Отправка — в exam-question-album-send.ts (файл-лимит
// CLAUDE.md, «сборка/отправка»): здесь только чистая функция без Mongo и без
// Telegram.
import { formatOptionLabel } from '@xuanxue/shared';
import type { AttemptQuestionDto } from '@xuanxue/shared';

const CAPTION_TEXT_MAX = 100;

export interface ImageAlbumEntry {
  kind: 'image';
  imageId: string;
  optionIndex: number;
  caption: string;
}

export interface VideoAlbumEntry {
  kind: 'video';
  videoId: string;
  /** `undefined` — видео самого вопроса, не варианта; идёт первым в списке. */
  optionIndex?: number;
  caption?: string;
}

export interface VideoLinkAlbumEntry {
  kind: 'videoLink';
  url: string;
  optionIndex?: number;
  caption?: string;
}

export type OptionAlbumEntry = ImageAlbumEntry | VideoAlbumEntry | VideoLinkAlbumEntry;

function truncateCaptionText(text: string): string {
  return text.length > CAPTION_TEXT_MAX
    ? `${text.slice(0, CAPTION_TEXT_MAX - 1)}…`
    : text;
}

/** «Вопрос 3 — вариант 1[: текст]» — номера вопроса и варианта те же, что
 * уже видны на экране (headerLine/formatOptionLabel, exam-question-screen.ts), так
 * фото и подпись кнопки читаются как один и тот же вариант. */
function buildImageCaption(
  questionIndex: number,
  optionIndex: number,
  text: string,
): string {
  const base = `Вопрос ${questionIndex + 1} — вариант ${optionIndex + 1}`;
  return text ? `${base}: ${truncateCaptionText(text)}` : base;
}

/** Видео варианта подписывается тем же текстом, что кнопка (formatOptionLabel,
 * ADR-0118) — «Вариант N», не «Вопрос N — вариант M», как у картинки: клип
 * идёт рядом с кнопкой того же варианта, вопрос на экране уже один. */
function buildOptionEntry(
  option: AttemptQuestionDto['options'][number],
  optionIndex: number,
  questionIndex: number,
): OptionAlbumEntry | null {
  if (option.imageId) {
    return {
      kind: 'image',
      imageId: option.imageId,
      optionIndex,
      caption: buildImageCaption(questionIndex, optionIndex, option.text),
    };
  }
  if (option.videoId) {
    return {
      kind: 'video',
      videoId: option.videoId,
      optionIndex,
      caption: formatOptionLabel(option.text, optionIndex),
    };
  }
  if (option.videoUrl) {
    // Не formatOptionLabel: подпись у ссылки — только номер варианта
    // («Вариант N: <ссылка>», exam-question-album-send.ts), сам текст
    // варианта уже виден на кнопке — дублировать его в тексте со ссылкой
    // незачем.
    return {
      kind: 'videoLink',
      url: option.videoUrl,
      optionIndex,
      caption: `Вариант ${optionIndex + 1}`,
    };
  }
  return null;
}

/** Видео формулировки вопроса (ADR-0133) — у любого вида вопроса, не только
 * single/multiple: «что не так в этом движении» бывает и у текстового
 * вопроса. Идёт первым в списке. */
function buildQuestionEntry(question: AttemptQuestionDto): OptionAlbumEntry | null {
  if (question.videoId) return { kind: 'video', videoId: question.videoId };
  if (question.videoUrl) return { kind: 'videoLink', url: question.videoUrl };
  return null;
}

/** Картинки и видео у ВАРИАНТОВ бывают только у single/multiple. Количество
 * вариантов отдельно не ограничиваем — optionsMax (EXAM_ITEM_LIMITS,
 * shared/src/exam-items.ts) уже держит вопрос в пределах 10 вариантов, ровно
 * потолка Telegram на альбом. */
export function buildOptionAlbum(
  question: AttemptQuestionDto,
  questionIndex: number,
): OptionAlbumEntry[] {
  const own = buildQuestionEntry(question);
  const options =
    question.kind === 'single' || question.kind === 'multiple'
      ? question.options.flatMap((option, optionIndex) => {
          const entry = buildOptionEntry(option, optionIndex, questionIndex);
          return entry ? [entry] : [];
        })
      : [];
  return own ? [own, ...options] : options;
}
