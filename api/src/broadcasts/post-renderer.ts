// Сборка значений плейсхолдеров из класса/занятия/настроек школы для
// renderTemplate (shared/src/templates.ts, ADR-0011) — сам синтаксис шаблона
// renderTemplate уже проверен на реальных постах (shared/src/templates.spec.ts);
// здесь — только откуда берётся каждое значение (docs/PLAN.md §6, таблица
// подстановок).
import { DateTime } from 'luxon';
import {
  formatDurationRu,
  renderTemplate,
  type Recording,
  type TemplateKind,
  type TemplateValues,
} from '@xuanxue/shared';

interface RenderClassInput {
  title: string;
  groupLabel: string;
  zoomLink?: string;
  zoomPassword?: string;
  tz: string;
  leadMinutes: number;
}

interface RenderLessonInput {
  topic: string;
  startsAt: Date;
  durationMin: number;
  zoomLinkOverride?: string;
  zoomPasswordOverride?: string;
}

export interface RenderLessonPostParams {
  cls: RenderClassInput;
  lesson: RenderLessonInput;
  /** Нужна только для kind 'recording' — у занятия записей может быть
   * несколько, вызывающий код выбирает нужную (G2). */
  recording?: Recording;
  /** {ведущий} = имя lessons.leaderId ?? classes.leaderId — резолвит вызывающий
   * код (User есть только у него), здесь просто готовое имя или его нет. */
  leaderName?: string;
  templates: Record<TemplateKind, string>;
  /** Момент рендера — для {минут}: фактические минуты до начала, не
   * `cls.leadMinutes` (на догоняющем тике leadMinutes уже соврал бы). */
  now: DateTime;
}

export function renderLessonPost(
  kind: TemplateKind,
  params: RenderLessonPostParams,
): string {
  const values =
    kind === 'recording' ? recordingValues(params) : lessonLinkValues(params);
  return renderTemplate(params.templates[kind], values);
}

function commonValues(params: RenderLessonPostParams): TemplateValues {
  return {
    тема: params.lesson.topic,
    время: DateTime.fromJSDate(params.lesson.startsAt, { zone: 'utc' })
      .setZone(params.cls.tz)
      .toFormat('HH:mm'),
    длительность: formatDurationRu(params.lesson.durationMin),
    ведущий: params.leaderName,
  };
}

function lessonLinkValues(params: RenderLessonPostParams): TemplateValues {
  const { cls, lesson } = params;
  const link = lesson.zoomLinkOverride ?? cls.zoomLink;
  // Пароль разовой ссылки не наследуется от пароля класса (PLAN §6): новая
  // ссылка со старым паролем в посте — не то, что учитель имел в виду.
  const password = lesson.zoomLinkOverride
    ? lesson.zoomPasswordOverride
    : cls.zoomPassword;
  return {
    ...commonValues(params),
    группа: cls.groupLabel,
    минут: minutesUntilStart(lesson.startsAt, params.now),
    название: cls.title,
    ссылка: link,
    пароль: password,
  };
}

/** Фактически оставшиеся минуты до начала, не `cls.leadMinutes`: догоняющий
 * тик мог опоздать на несколько минут, и «через 30 минут» в посте, отправленном
 * за 27 минут до занятия, было бы неправдой (docs/PLAN.md §6). Минимум 1 —
 * «через 0 минут» и тем более отрицательное число ученику не сообщают ничего
 * полезного, округление вверх — чтобы не занизить время на границе минуты. */
function minutesUntilStart(startsAt: Date, now: DateTime): number {
  const diff = DateTime.fromJSDate(startsAt, { zone: 'utc' }).diff(
    now,
    'minutes',
  ).minutes;
  return Math.max(1, Math.ceil(diff));
}

function recordingValues(params: RenderLessonPostParams): TemplateValues {
  return {
    ...commonValues(params),
    название: params.recording?.title,
    ссылка: params.recording?.url,
  };
}
