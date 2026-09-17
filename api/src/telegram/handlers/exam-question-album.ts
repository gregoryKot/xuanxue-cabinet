// Альбом картинок вариантов вопроса (ADR-0035, docs/PLAN.md §12 слой 4б.2) —
// список «какую картинку показать и с какой подписью» перед экраном кнопок:
// ученику нужно ВИДЕТЬ вариант, а не только прочитать «Вариант N»
// (optionLabel, exam-question-screen.ts). Отправка — в
// exam-question-album-send.ts (файл-лимит CLAUDE.md, «сборка/отправка»):
// здесь только чистая функция без Mongo и без Telegram.
import type { AttemptQuestionDto } from '@xuanxue/shared';

const CAPTION_TEXT_MAX = 100;

export interface OptionAlbumEntry {
  imageId: string;
  optionIndex: number;
  caption: string;
}

function truncateCaptionText(text: string): string {
  return text.length > CAPTION_TEXT_MAX
    ? `${text.slice(0, CAPTION_TEXT_MAX - 1)}…`
    : text;
}

/** «Вопрос 3 — вариант 1[: текст]» — номера вопроса и варианта те же, что
 * уже видны на экране (headerLine/optionLabel, exam-question-screen.ts), так
 * фото и подпись кнопки читаются как один и тот же вариант. */
function buildCaption(questionIndex: number, optionIndex: number, text: string): string {
  const base = `Вопрос ${questionIndex + 1} — вариант ${optionIndex + 1}`;
  return text ? `${base}: ${truncateCaptionText(text)}` : base;
}

/** Только у single/multiple бывают варианты с картинкой. Количество отдельно
 * не ограничиваем — optionsMax (EXAM_ITEM_LIMITS, shared/src/exams.ts) уже
 * держит вопрос в пределах 10 вариантов, ровно потолка Telegram на альбом. */
export function buildOptionAlbum(
  question: AttemptQuestionDto,
  questionIndex: number,
): OptionAlbumEntry[] {
  if (question.kind !== 'single' && question.kind !== 'multiple') return [];
  return question.options.flatMap((option, optionIndex) =>
    option.imageId
      ? [
          {
            imageId: option.imageId,
            optionIndex,
            caption: buildCaption(questionIndex, optionIndex, option.text),
          },
        ]
      : [],
  );
}
