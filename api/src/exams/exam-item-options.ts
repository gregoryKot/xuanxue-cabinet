// Чистые функции проверки и подготовки вариантов ответа — без похода в базу,
// юнит-тест без Mongo (CLAUDE.md, раздел «Тесты»). Правило combines type+
// options (ТЗ 4.2, п.2) — про сочетание полей, поэтому в сервисе, не в DTO.
import {
  ASK_REASON_KIND_MESSAGE,
  EXAM_ITEM_LIMITS,
  OPTION_CONTENT_REQUIRED_MESSAGE,
  OPTION_ONE_MEDIA_MESSAGE,
  type ExamItemKind,
  type ExamItemOptionInput,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { ExamItemOptionRecord, ExamItemVersionRecord } from './exam-item.schema';
import { keepOrGenerateId } from './sub-id';

const NO_OPTIONS_KINDS: readonly ExamItemKind[] = ['text', 'video'];
const HAS_OPTIONS_KINDS: readonly ExamItemKind[] = ['single', 'multiple'];

/** ADR-0146: просить объяснение можно только у вопроса с выбором варианта —
 * у text/video объяснять нечего (там ответ и так свободный текст/видео). */
export function assertReasonAllowedForKind(kind: ExamItemKind, askReason: boolean): void {
  if (askReason && !HAS_OPTIONS_KINDS.includes(kind)) {
    throw new InvalidInputError(ASK_REASON_KIND_MESSAGE);
  }
}

/**
 * Проверяет варианты против типа вопроса и возвращает нормализованный
 * список (`undefined` на входе → `[]`, чтобы вызывающему не думать про
 * отсутствие поля отдельно). Текст/видео — без вариантов вовсе; выбор
 * одного/нескольких — от `optionsMin` до `optionsMax` штук, у каждого текст
 * или картинка (ADR-0035) и нужное число отмеченных «верно».
 */
export function assertOptionsForKind(
  kind: ExamItemKind,
  options: ExamItemOptionInput[] | undefined,
): ExamItemOptionInput[] {
  const list = options ?? [];
  if (NO_OPTIONS_KINDS.includes(kind)) {
    if (list.length > 0) {
      throw new InvalidInputError(
        'У вопроса такого типа не бывает вариантов ответа. Уберите их из запроса.',
      );
    }
    return list;
  }
  if (!HAS_OPTIONS_KINDS.includes(kind)) return list;
  if (
    list.length < EXAM_ITEM_LIMITS.optionsMin ||
    list.length > EXAM_ITEM_LIMITS.optionsMax
  ) {
    throw new InvalidInputError(
      `Укажите от ${EXAM_ITEM_LIMITS.optionsMin} до ${EXAM_ITEM_LIMITS.optionsMax} вариантов ответа.`,
    );
  }
  // До подсчёта верных — пустой вариант (ни текста, ни картинки, ни видео)
  // отказывает сразу самим собой, а не путается с «не тот вариант отмечен»
  // (ADR-0035, дополнено ADR-0133).
  if (
    list.some(
      (option) =>
        !option.text?.trim() && !option.imageId && !option.videoId && !option.videoUrl,
    )
  ) {
    throw new InvalidInputError(OPTION_CONTENT_REQUIRED_MESSAGE);
  }
  // Одно медиа на вариант — картинка или видео (файл R2 или ссылка), не оба
  // (ADR-0133): порядок показа «что первым» иначе решался бы молча на экране.
  if (
    list.some(
      (option) => Boolean(option.imageId) && Boolean(option.videoId || option.videoUrl),
    )
  ) {
    throw new InvalidInputError(OPTION_ONE_MEDIA_MESSAGE);
  }
  if (list.some((option) => option.videoId && option.videoUrl)) {
    throw new InvalidInputError(OPTION_ONE_MEDIA_MESSAGE);
  }
  const correctCount = list.filter((option) => option.correct === true).length;
  if (kind === 'single' && correctCount !== 1) {
    throw new InvalidInputError('Отметьте ровно один правильный вариант.');
  }
  if (kind === 'multiple' && correctCount < 1) {
    throw new InvalidInputError('Отметьте хотя бы один правильный вариант.');
  }
  return list;
}

/** Список для записи в базу (потом шифруется целиком через `encJson`,
 * exam-item.schema.ts). `id` есть у существующего варианта — сохраняется как
 * есть; без `id` — новый, сервис создаёт его сам (`keepOrGenerateId`,
 * sub-id.ts — тот же приём, что у блоков формы экзамена, exam-blocks.ts, и у
 * `ScheduleRuleInput`/`mapRules` в classes/classes.update.ts). */
export function mapOptions(options: ExamItemOptionInput[]): ExamItemOptionRecord[] {
  return options.map((option) => ({
    id: keepOrGenerateId(option.id),
    text: option.text?.trim() ?? '',
    correct: option.correct ?? false,
    // Ключа нет вовсе, если медиа не было — не `imageId: undefined`:
    // сравнение версий в exam-item-content-change.ts идёт по JSON.stringify
    // нормализованных записей, лишний ключ добавил бы нестабильности.
    ...(option.imageId !== undefined ? { imageId: option.imageId } : {}),
    ...(option.videoId !== undefined ? { videoId: option.videoId } : {}),
    ...(option.videoUrl !== undefined ? { videoUrl: option.videoUrl } : {}),
  }));
}

/** Уникальные `imageId` текущих вариантов и всех версий истории, в порядке
 * появления (Set). Плоская копия для `exam_items.imageIds` — сами
 * `options`/`history` зашифрованы целиком (`encJson`, exam-item.schema.ts) и
 * Mongo внутрь них не видит: по этому полю уборщик сирот (ADR-0035) находит,
 * какие картинки ещё используются вопросом. */
export function collectImageIds(
  options: readonly ExamItemOptionRecord[],
  history: readonly ExamItemVersionRecord[],
): string[] {
  const ids = new Set<string>();
  for (const option of options) {
    if (option.imageId) ids.add(option.imageId);
  }
  for (const version of history) {
    for (const option of version.options) {
      if (option.imageId) ids.add(option.imageId);
    }
  }
  return [...ids];
}

/** Уникальные `videoId` вариантов текущей редакции и истории, тем же приёмом
 * и ради той же причины, что `collectImageIds` выше (ADR-0133): уборщик
 * видео-сирот (exam-video-sweep.service.ts) находит по этому полю, какие
 * видео ещё используются вопросом. Видео вопроса (top-level `videoId`)
 * собирает вызывающий сервис — этот файл знает только про варианты. */
export function collectOptionVideoIds(
  options: readonly ExamItemOptionRecord[],
  history: readonly ExamItemVersionRecord[],
): string[] {
  const ids = new Set<string>();
  for (const option of options) {
    if (option.videoId) ids.add(option.videoId);
  }
  for (const version of history) {
    for (const option of version.options) {
      if (option.videoId) ids.add(option.videoId);
    }
  }
  return [...ids];
}
