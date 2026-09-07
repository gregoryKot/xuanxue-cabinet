// Предпросмотр сохранённого шаблона на реальном занятии (`POST
// /settings/preview`, docs/PLAN.md §6 «Шаблоны») — тот же рендер, что и у
// планировщика рассылки (post-renderer.ts, broadcast-planner.render.ts), без
// записи в БД: учитель видит пост заранее.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { PreviewTemplateResult, Recording, TemplateKind } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { decryptRecord } from '../utils/encryption';
import { findClassForRecording } from '../broadcasts/broadcast-planner.queries';
import { resolveLeaderName } from '../broadcasts/broadcast-planner.render';
import { renderLessonPost } from '../broadcasts/post-renderer';
import type { ClassRecord } from '../classes/class.schema';
import { LESSON_NOT_FOUND, assertLessonId } from '../lessons/lessons.queries';
import { LESSON_ENCRYPT_SCHEMA, type LessonRecord } from '../lessons/lesson.schema';
import type { UsersService } from '../users/users.service';

const LESSON_PROJECTION = {
  classId: 1,
  topic: 1,
  startsAt: 1,
  durationMin: 1,
  leaderId: 1,
  zoomLinkOverride: 1,
  zoomPasswordOverride: 1,
  recordings: 1,
} as const;

// Pick — гомоморфный mapped type, совместим с decryptRecord<T extends
// Record<string, unknown>> (тот же приём, что у LeanLesson/LeanBroadcast).
type PreviewLesson = Pick<
  LessonRecord,
  | 'classId'
  | 'topic'
  | 'startsAt'
  | 'durationMin'
  | 'leaderId'
  | 'zoomLinkOverride'
  | 'zoomPasswordOverride'
  | 'recordings'
>;

const CLASS_NOT_FOUND = 'Занятие без класса в базе. Обновите список.';

/** Записи у занятия ещё может не быть — учитель предпросматривает шаблон
 * заранее, не дожидаясь «Добавить запись». Последняя добавленная запись,
 * если есть; иначе стенд-ин из темы занятия — реальный текст появится сам,
 * как только запись добавят (docs/PLAN.md §6). `isStandIn` — экран показывает
 * пометку «Записи у занятия ещё нет», а не выдаёт стенд-ин за настоящую запись. */
function previewRecording(
  lesson: PreviewLesson,
  className: string,
): { recording: Recording; isStandIn: boolean } {
  const last = lesson.recordings[lesson.recordings.length - 1];
  if (last) return { recording: last, isStandIn: false };
  return { recording: { title: lesson.topic || className }, isStandIn: true };
}

export async function previewTemplate(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  usersService: UsersService,
  templates: Record<TemplateKind, string>,
  kind: TemplateKind,
  lessonId: string,
  now: DateTime,
): Promise<PreviewTemplateResult> {
  assertLessonId(lessonId);
  const doc = await lessonModel
    .findById(lessonId, LESSON_PROJECTION)
    .lean<PreviewLesson | null>();
  if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
  const lesson = decryptRecord(doc, LESSON_ENCRYPT_SCHEMA);

  const cls = await findClassForRecording(classModel, lesson.classId);
  if (!cls) throw new NotFoundError(CLASS_NOT_FOUND);

  const leaderName = await resolveLeaderName(
    usersService,
    lesson.leaderId ?? cls.leaderId,
  );
  if (kind !== 'recording') {
    const text = renderLessonPost('lesson_link', {
      cls,
      lesson,
      templates,
      leaderName,
      now,
    });
    return { text };
  }
  const { recording, isStandIn } = previewRecording(lesson, cls.title);
  const text = renderLessonPost('recording', {
    cls,
    lesson,
    recording,
    templates,
    leaderName,
    now,
  });
  return isStandIn ? { text, recordingIsStandIn: true } : { text };
}
