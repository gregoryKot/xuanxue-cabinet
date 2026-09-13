// Видео экзамена — контракт трёх путей привязки (ADR-0023, docs/PLAN.md §11
// слой 4.5): сообщением боту, ссылкой, вручную учителем. Байты не идут через
// нас — `ExamMediaDto` поэтому никогда не несёт `fileId`/`fileUniqueId`: они
// ведут прямо к видео в Telegram, а секретные поля документа наружу не
// возвращаются (CLAUDE.md «API»). Открыть видео учитель может в самом
// Telegram — бот пересылает его туда сразу при получении, в личный чат
// учителя с ботом (тот же канал, что предпросмотр и «Запись?»); отдельной
// ссылки «на конкретное сообщение» Telegram ботам не даёт, так что показывать
// в кабинете нечего, кроме факта и времени получения.

export const EXAM_MEDIA_KINDS = ['telegram', 'link', 'manual'] as const;
export type ExamMediaKind = (typeof EXAM_MEDIA_KINDS)[number];

export interface ExamMediaDto {
  id: string;
  attemptId: string;
  kind: ExamMediaKind;
  /** Только `kind: 'link'`. */
  url?: string;
  /** Оба — только `kind: 'telegram'`: Telegram отдаёт их в самом сообщении,
   * без обращения к видео (ADR-0023, `getFile` не зовём вовсе). */
  durationSec?: number;
  sizeBytes?: number;
  receivedAt: string; // ISO UTC с Z
  /** Короткая подпись — кто и как отметил вручную (`kind: 'manual'`). */
  note?: string;
}

export interface AddExamMediaLinkInput {
  url: string;
}

export interface AddExamMediaManualInput {
  note?: string;
}

export const EXAM_MEDIA_LIMITS = {
  url: 500,
  note: 300,
} as const;

// VOICE: что случилось и что сделать дальше, не «неверный формат».
export const EXAM_MEDIA_INVALID_URL_MESSAGE =
  'Это не похоже на ссылку на видео. Проверьте адрес и отправьте ещё раз.';

// «Попытка не найдена» переиспользует ATTEMPT_NOT_FOUND_MESSAGE (exams.ts) —
// тот же смысл и тот же текст для чужого и для несуществующего attemptId
// (SECURITY §3: не подтверждаем даже факт существования чужой попытки).

// Решение об уникальности: ссылка на попытку — одна (media-asset.schema.ts,
// частичный уникальный индекс). Повторная отправка ссылки получает этот
// отказ, а не тихий дубль, из которого потом непонятно, какую ссылку
// открывать. Видео из Telegram и ручные отметки не ограничены: «кружок» и
// обычное видео — два разных файла одного ответа, а поправленная подпись
// учителя — законная вторая отметка, не дубль.
export const EXAM_MEDIA_ALREADY_LINKED_MESSAGE =
  'К этой попытке уже прикреплена ссылка на видео. Если ошиблись — напишите учителю, он поправит.';
