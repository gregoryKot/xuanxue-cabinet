// Тема недели (ADR-0197): один текст в `lessons.topic` нескольких занятий
// одним запросом `POST /lessons/topic`. Своей записи в базе у темы недели
// нет — пост читает тему оттуда же, откуда и при правке одной даты, и
// пересборка ещё не ушедшего поста идёт тем же путём (LessonsService.update).
import { LIST_LIMIT_MAX } from './classes';
import type { LessonDto } from './lessons';

/** Потолок одного запроса — столько же, сколько список отдаёт за раз
 * (LIST_LIMIT_MAX): отметить больше, чем есть на экране, нельзя. */
export const WEEK_TOPIC_MAX_IDS = LIST_LIMIT_MAX;

/** Тело `POST /lessons/topic`. Пустой `topic` снимает тему у отмеченных. */
export interface SetLessonsTopicInput {
  topic: string;
  lessonIds: string[];
}

/** Ответ — занятия после записи, в порядке `lessonIds`: экран обновляет
 * список из ответа, а не отдельным GET (CLAUDE.md «Read-after-write»). */
export type SetLessonsTopicResult = LessonDto[];
