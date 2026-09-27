// Чистая логика формы вопроса — состояние, валидация и сборка тела запроса,
// вынесены из useExamItemForm.ts, чтобы проверять без React (CLAUDE.md
// «Тесты»), по образцу schedule/classFormInput.ts. hint/criteria/tags убраны
// из вопроса вместе с полем (ADR-0128) — форма несёт только формулировку,
// видео и варианты ответа.
import {
  EXAM_ITEM_LIMITS,
  OPTION_CONTENT_REQUIRED_MESSAGE,
  type CreateExamItemInput,
  type ExamItemDto,
  type ExamItemKind,
  type ExamItemOptionInput,
  type UpdateExamItemInput,
} from '@xuanxue/shared';
import { validateExamVideoMedia } from './examVideoFormInput';

/** `imageId`/`videoId`/`videoUrl` — медиа варианта (ADR-0035/ADR-0133): форма
 * несёт их сквозь правку как есть, иначе «открыл, поправил текст, сохранил»
 * молча снимало бы медиа с варианта — options в PATCH заменяют набор целиком.
 * Не больше одного вида медиа разом — проверяет validateExamVideoMedia
 * (examVideoFormInput.ts) тем же правилом, что assertOptionsForKind. */
export interface ExamItemOptionDraft {
  id?: string;
  text: string;
  correct: boolean;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
}

export interface ExamItemFormState {
  /** Меняется только при создании — при правке форма получает kind из
   * существующего вопроса и больше его не трогает (ExamItemFormFields
   * рисует его текстом, не select'ом; ТЗ 4.2, п.1). */
  kind: ExamItemKind;
  prompt: string;
  /** Видео формулировки (ADR-0133) — файл (R2) или ссылка, не оба разом. */
  videoId?: string;
  videoUrl?: string;
  options: ExamItemOptionDraft[];
}

const DEFAULT_KIND: ExamItemKind = 'text';

/** Тип вопроса, у которого есть варианты ответа — совпадает с
 * HAS_OPTIONS_KINDS на бэкенде (exam-item-options.ts): один источник смысла
 * пришлось бы дублировать через границу пакетов, поэтому здесь та же пара
 * значений перечислена явно ещё раз. */
export function hasOptions(kind: ExamItemKind): boolean {
  return kind === 'single' || kind === 'multiple';
}

export function initialExamItemFormState(item: ExamItemDto | null): ExamItemFormState {
  return {
    kind: item?.kind ?? DEFAULT_KIND,
    prompt: item?.prompt ?? '',
    videoId: item?.videoId,
    videoUrl: item?.videoUrl,
    options:
      item?.options.map((option) => ({
        id: option.id,
        text: option.text,
        correct: option.correct,
        imageId: option.imageId,
        videoId: option.videoId,
        videoUrl: option.videoUrl,
      })) ?? [],
  };
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. Проверки
 * вариантов ответа зеркалят assertOptionsForKind на бэкенде
 * (exam-item-options.ts) — форма не даёт отправить то, что сервис всё равно
 * отклонит, вместо круга «сохранить → 400 → понять почему». */
export function validateExamItemForm(state: ExamItemFormState): string | null {
  if (!state.prompt.trim()) return 'Впишите формулировку вопроса.';
  const mediaError = validateExamVideoMedia(state);
  if (mediaError) return mediaError;
  if (!hasOptions(state.kind)) return null;

  if (
    state.options.length < EXAM_ITEM_LIMITS.optionsMin ||
    state.options.length > EXAM_ITEM_LIMITS.optionsMax
  ) {
    return `Укажите от ${EXAM_ITEM_LIMITS.optionsMin} до ${EXAM_ITEM_LIMITS.optionsMax} вариантов ответа.`;
  }
  // Текст, картинка или видео — то же правило, что у сервиса
  // (OPTION_CONTENT_REQUIRED_MESSAGE).
  if (
    state.options.some(
      (option) =>
        !option.text.trim() && !option.imageId && !option.videoId && !option.videoUrl,
    )
  ) {
    return OPTION_CONTENT_REQUIRED_MESSAGE;
  }
  const correctCount = state.options.filter((option) => option.correct).length;
  if (state.kind === 'single' && correctCount !== 1) {
    return 'Отметьте ровно один правильный вариант.';
  }
  if (state.kind === 'multiple' && correctCount < 1) {
    return 'Отметьте хотя бы один правильный вариант.';
  }
  return null;
}

/** `undefined` у типов без вариантов (text/video) — сервис отклоняет сам
 * факт присланного массива для такого типа (assertOptionsForKind), поле
 * лучше не отправлять вовсе, чем отправлять пустым. */
function toOptionsInput(state: ExamItemFormState): ExamItemOptionInput[] | undefined {
  if (!hasOptions(state.kind)) return undefined;
  return state.options.map((option) => ({
    id: option.id,
    text: option.text.trim(),
    correct: option.correct,
    imageId: option.imageId,
    videoId: option.videoId,
    videoUrl: option.videoUrl,
  }));
}

export function toCreateInput(state: ExamItemFormState): CreateExamItemInput {
  return {
    kind: state.kind,
    prompt: state.prompt.trim(),
    videoId: state.videoId || undefined,
    videoUrl: state.videoUrl || undefined,
    options: toOptionsInput(state),
  };
}

export function toUpdateInput(state: ExamItemFormState): UpdateExamItemInput {
  return {
    prompt: state.prompt.trim(),
    // Пусто — явный сброс (null, videoId/videoUrl входят в
    // NULLABLE_EXAM_ITEM_FIELDS), не «оставить как было» (тот же приём, что
    // zoomLink/leaderId в schedule/classFormInput.ts).
    videoId: state.videoId || null,
    videoUrl: state.videoUrl || null,
    options: toOptionsInput(state),
  };
}
