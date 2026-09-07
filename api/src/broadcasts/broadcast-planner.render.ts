// Резолв {ведущий} и сборка текста поста (ссылка на занятие, запись) —
// вынесено из broadcast-planner.service.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»). Обе рассылки (планировщик ссылок и RecordingBroadcastService)
// резолвят {ведущий} одним и тем же приёмом — одна функция, не две копии.
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { Recording, TemplateKind } from '@xuanxue/shared';
import type { UsersService } from '../users/users.service';
import { renderLessonPost } from './post-renderer';
import type { PlannerClass, PlannerLesson } from './broadcast-planner.queries';

/** {ведущий} = имя lessons.leaderId ?? classes.leaderId — одно чтение на
 * занятие, только если ведущий назначен. Экспортирована — тем же приёмом
 * резолвит имя предпросмотр шаблона (settings-preview.ts, docs/PLAN.md §6
 * «Шаблоны»), не копией. */
export async function resolveLeaderName(
  usersService: UsersService,
  leaderId: Types.ObjectId | undefined,
): Promise<string | undefined> {
  if (!leaderId) return undefined;
  return (await usersService.findById(leaderId.toString()))?.name;
}

export async function buildLessonLinkText(
  usersService: UsersService,
  lesson: PlannerLesson,
  cls: PlannerClass,
  templates: Record<TemplateKind, string>,
  now: DateTime,
): Promise<string> {
  const leaderName = await resolveLeaderName(
    usersService,
    lesson.leaderId ?? cls.leaderId,
  );
  return renderLessonPost('lesson_link', { cls, lesson, templates, leaderName, now });
}

/** Текст поста рассылки записи (docs/PLAN.md §6, kind 'recording') —
 * {ведущий} тот же приём, что у ссылки на занятие. */
export async function buildRecordingText(
  usersService: UsersService,
  lesson: Pick<PlannerLesson, 'topic' | 'startsAt' | 'durationMin' | 'leaderId'>,
  cls: PlannerClass,
  recording: Recording,
  templates: Record<TemplateKind, string>,
  now: DateTime,
): Promise<string> {
  const leaderName = await resolveLeaderName(
    usersService,
    lesson.leaderId ?? cls.leaderId,
  );
  return renderLessonPost('recording', {
    cls,
    lesson,
    recording,
    templates,
    leaderName,
    now,
  });
}
