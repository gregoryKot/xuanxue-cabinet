// Маппер LessonRecord + ClassRecord (lean, уже расшифрованные) →
// MyArchivedLessonDto (`/me/lessons/archive`, ТЗ docs/PLAN.md §14 слой 3.3).
// Чистая функция без Mongo и DI — тот же уровень теста, что у
// my-lesson.mapper.spec.ts.
import type { Types } from 'mongoose';
import type {
  ArchivedRecordingDto,
  LessonStatus,
  MyArchivedLessonDto,
  Recording,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';

export interface MyArchivedLessonClassInput {
  title: string;
  groupLabel: string;
}

export interface MyArchivedLessonInput {
  _id: Types.ObjectId;
  startsAt: Date;
  topic: string;
  status: LessonStatus;
  recordings: Recording[];
  /** Честно необязателен — та же причина, что у MyLessonInput.tags
   * (my-lesson.mapper.ts): дата занятия до ADR-0070 не хранит поле. */
  tags?: string[];
}

export function toMyArchivedLessonDto(
  lesson: MyArchivedLessonInput,
  cls: MyArchivedLessonClassInput,
): MyArchivedLessonDto {
  return {
    id: lesson._id.toString(),
    startsAt: toIsoUtc(lesson.startsAt),
    classTitle: cls.title,
    groupLabel: cls.groupLabel,
    topic: lesson.topic,
    status: lesson.status,
    recordings: lesson.recordings
      .map(toArchivedRecordingDto)
      .filter((recording): recording is ArchivedRecordingDto => recording !== null),
    // Тег видит и ученик (ADR-0070) — архив не исключение из этого правила.
    tags: lesson.tags ?? [],
  };
}

// `telegramFileId` наружу не уходит никогда (ключ к файлу в Telegram, ученику
// бесполезен и не его дело — тот же приём, что у media-asset.mapper.ts):
// вместо него флаг `inTelegramOnly`. Запись без url и без telegramFileId в
// базе быть не должна (assertHasRecordingSource на записи), но схема это
// допускает — такую запись пропускаем совсем, чтобы экран не рисовал строку
// «Открыть» в никуда.
function toArchivedRecordingDto(recording: Recording): ArchivedRecordingDto | null {
  if (recording.url) return { title: recording.title, url: recording.url };
  if (recording.telegramFileId) {
    return { title: recording.title, inTelegramOnly: true };
  }
  return null;
}
