// Резолв {ведущий} и сборка текста поста-ссылки на занятие — вынесено из
// broadcast-planner.service.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
import type { DateTime } from 'luxon';
import type { TemplateKind } from '@xuanxue/shared';
import type { UsersService } from '../users/users.service';
import { renderLessonPost } from './post-renderer';
import type { PlannerClass, PlannerLesson } from './broadcast-planner.queries';

/** {ведущий} = имя lessons.leaderId ?? classes.leaderId — одно чтение на
 * занятие, только если ведущий назначен. */
export async function buildLessonLinkText(
  usersService: UsersService,
  lesson: PlannerLesson,
  cls: PlannerClass,
  templates: Record<TemplateKind, string>,
  now: DateTime,
): Promise<string> {
  const leaderId = lesson.leaderId ?? cls.leaderId;
  const leaderName = leaderId
    ? (await usersService.findById(leaderId.toString()))?.name
    : undefined;
  return renderLessonPost('lesson_link', { cls, lesson, templates, leaderName, now });
}
