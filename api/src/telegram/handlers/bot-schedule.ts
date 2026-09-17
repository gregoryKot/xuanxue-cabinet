// Экран «Ближайшие занятия» в боте: тот же подбор, что `GET /me/lessons`
// (MyLessonsService) — бот не выбирает занятия сам, только показывает то,
// что уже отдаёт сервис (CLAUDE.md «Одна механика — один компонент»).
// Время — в поясе школы: у бота нет профиля устройства человека, в отличие
// от кабинета.
import { DateTime } from 'luxon';
import { SCHOOL_TZ, type MyLessonDto } from '@xuanxue/shared';
import { backToMenuButton, type BotMenu } from './bot-menu';

export const SCHEDULE_LESSONS_LIMIT = 5;
const NO_LESSONS_TEXT = 'Ближайших занятий нет.';
const ZOOM_LINK_FALLBACK = 'Ссылку пришлём в канал.';
const LOCATION_FALLBACK = 'Адрес пришлём в канал.';

export function formatScheduleScreen(lessons: MyLessonDto[]): BotMenu {
  const text =
    lessons.length === 0 ? NO_LESSONS_TEXT : lessons.map(formatLesson).join('\n\n');
  return { text, buttons: [backToMenuButton()] };
}

function formatLesson(lesson: MyLessonDto): string {
  const time = DateTime.fromISO(lesson.startsAt, { zone: 'utc' })
    .setZone(SCHOOL_TZ)
    .toFormat('dd.MM HH:mm');
  const header = `${lesson.classTitle}, ${time}`;
  // Отменённое занятие показываем отменённым и без ссылки: звать на встречу,
  // которой не будет, — хуже, чем не показать её вовсе.
  if (lesson.status === 'cancelled') return `${header} — отменено.`;
  return `${header}\n${formatMeetingLine(lesson)}`;
}

function formatMeetingLine(lesson: MyLessonDto): string {
  const online = lesson.zoomLink
    ? `Zoom: ${lesson.zoomLink}${lesson.zoomPassword ? ` (пароль ${lesson.zoomPassword})` : ''}`
    : ZOOM_LINK_FALLBACK;
  const offline = lesson.location ?? LOCATION_FALLBACK;
  if (lesson.format === 'both') return `${online}\n${offline}`;
  return lesson.format === 'online' ? online : offline;
}
