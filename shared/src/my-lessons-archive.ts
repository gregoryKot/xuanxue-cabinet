// Архив занятий ученика (`GET /me/lessons/archive`, ТЗ docs/PLAN.md §14
// слой 3.3). Отдельным файлом, потому что lessons.ts упёрся в лимит размера
// (CLAUDE.md «Храповики») — тот же приём, что у my-exams.ts (exams.ts).
import type { LessonStatus } from './domain';
import type { MyMaterialDto } from './materials';

/** Запись прошедшего занятия глазами ученика. `telegramFileId` из
 * `Recording` сюда никогда не попадает — тот же приём, что у
 * `ExamMediaDto`/`media-asset.mapper.ts`: это ключ к файлу в Telegram,
 * ученику он бесполезен и не его дело. Запись, у которой есть только
 * `telegramFileId` (учитель отдал файл боту, он ушёл в канал школы) —
 * `inTelegramOnly: true`, браузеру такую запись открыть нечем. */
export interface ArchivedRecordingDto {
  title?: string;
  /** Есть, когда запись открывается ссылкой. */
  url?: string;
  /** true — запись существует, но живёт файлом в Telegram: браузеру её
   * открыть нечем, экран говорит искать её в канале школы (ТЗ §14). */
  inTelegramOnly?: true;
}

/** Прошедшее занятие в архиве ученика. Отменённое прошедшее занятие из
 * архива не выкидывается — ученик должен видеть, что занятие было отменено,
 * а не решить, что оно пропало из списка (ТЗ §14, «3.3. Архив занятий у
 * ученика»), поэтому `status` едет в DTO как есть, включая `cancelled`. */
export interface MyArchivedLessonDto {
  id: string;
  startsAt: string; // ISO UTC с Z
  classTitle: string;
  groupLabel: string;
  topic: string;
  status: LessonStatus;
  recordings: ArchivedRecordingDto[];
  /** Тег видит и ученик (ADR-0075) — та же рубрика, что и в «ближайших
   * занятиях» (MyLessonDto.tags), архив не исключение. */
  tags: string[];
  /** Материалы, привязанные к этой дате занятия (`materials.lessonIds`,
   * ADR-0056, раздел «Ученик видит привязку там, где ищет»): «что было во
   * вторник» — запись и ссылки в одном месте, без похода в библиотеку.
   * Тип — тот же `MyMaterialDto`, что у `GET /me/materials`: второго типа
   * того же самого не заводим, значит и рубильник оплаты (ADR-0048) здесь
   * действует тот же — закрытый материал приезжает без `url` и с
   * `locked: true`. Пустой массив — у даты материалов нет, экран тогда не
   * рисует рубрику вовсе. Материалы курса и общие остаются в библиотеке
   * (ADR-0056), в архив они не попадают. */
  materials: MyMaterialDto[];
}

export interface ListMyArchivedLessonsQuery {
  limit?: number;
}

/** Лимит архива — своя пара, не MY_LESSONS_LIMIT_* (lessons.ts): список
 * назад от `now` может расти со временем жизни школы, экран листает его
 * отдельно от ближайших занятий (ТЗ docs/PLAN.md §14). */
export const MY_ARCHIVE_LIMIT_DEFAULT = 20;
export const MY_ARCHIVE_LIMIT_MAX = 100;
