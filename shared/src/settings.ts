// DTO и константы API настроек школы (`/settings`) — шаблоны постов
// (docs/PLAN.md §6 «Шаблоны», ADR-0011). Общий контракт api и web
// (CLAUDE.md, раздел «Слои»).
import type { TemplateKind } from './default-templates';

export interface SettingsDto {
  templates: Record<TemplateKind, string>;
  tz: string;
  updatedAt: string; // ISO UTC с Z
}

/** PATCH: шаблон, которого нет в теле, не трогается — учитель правит один
 * текст за раз, а не оба сразу (образец — UpdateClassInput). */
export interface UpdateSettingsInput {
  templates?: Partial<Record<TemplateKind, string>>;
}

/** Тело `POST /settings/preview` — рендер сохранённого шаблона (из базы, не
 * то, что учитель напечатал в форме и ещё не нажал «Сохранить») на реальном
 * занятии, чтобы учитель увидел пост заранее (docs/PLAN.md §6). */
export interface PreviewTemplateInput {
  kind: TemplateKind;
  lessonId: string;
}

export interface PreviewTemplateResult {
  text: string;
  /** `kind: 'recording'`, а записи у занятия ещё нет — текст собран из темы
   * занятия как стенд-ин (docs/PLAN.md §6): экран показывает пометку
   * «Записи у занятия ещё нет — показали, как будет выглядеть пост», а не
   * выдаёт стенд-ин за настоящую запись. Для `lesson_link` всегда отсутствует. */
  recordingIsStandIn?: boolean;
}

export const SETTINGS_LIMITS = {
  templateMaxLength: 2000,
} as const;
