// DTO и константы API настроек школы (`/settings`) — шаблоны постов
// (docs/PLAN.md §6 «Шаблоны», ADR-0011). Общий контракт api и web
// (CLAUDE.md, раздел «Слои»).
import type { TemplateKind } from './default-templates';

export interface SettingsDto {
  templates: Record<TemplateKind, string>;
  tz: string;
  /** Адрес сайта школы — единственная ссылка на расписание для ученика и
   * незнакомца, у которых нет роли в кабинете (В6 аудита, ADR-0009-доп.):
   * `PUBLIC_URL` — адрес самого кабинета, не сайта школы, и наружу не
   * отдаётся. Поля нет, если учитель ещё не заполнил экран «Шаблоны». */
  schoolSiteUrl?: string;
  /** За сколько минут до отправки бот показывает учителю черновик поста
   * (docs/PLAN.md §6 «Telegram-бот для учителя») — настройка школы, не
   * константа (CLAUDE.md «Кабинет учителя: всё настраивается в интерфейсе»);
   * старая база без поля отдаёт `DEFAULT_PREVIEW_MINUTES` (domain.ts). */
  previewMinutes: number;
  updatedAt: string; // ISO UTC с Z
}

/**
 * PATCH: шаблон, которого нет в теле, не трогается — учитель правит один
 * текст за раз, а не оба сразу (образец — UpdateClassInput). `schoolSiteUrl:
 * null` — явный сброс (NULLABLE_SETTINGS_FIELDS ниже, splitUpdate,
 * common/patch-update.ts): пустое поле формы значит «сайта нет», не
 * «оставить как было».
 */
export interface UpdateSettingsInput {
  templates?: Partial<Record<TemplateKind, string>>;
  schoolSiteUrl?: string | null;
  /** Целое число минут (`SETTINGS_LIMITS.previewMinutesMin`…`Max`) — не
   * входит в NULLABLE_SETTINGS_FIELDS: сбросить в «нет значения» нельзя,
   * только заменить другим числом. */
  previewMinutes?: number;
}

/** Единственное nullable-поле UpdateSettingsInput — источник правды для DTO
 * (`@IsOptional()` вместо `OptionalNotNull()`) и для `splitUpdate`, тот же
 * приём, что у NULLABLE_CLASS_FIELDS/NULLABLE_LESSON_FIELDS. */
export const NULLABLE_SETTINGS_FIELDS = ['schoolSiteUrl'] as const;

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
  schoolSiteUrlMaxLength: 500,
  previewMinutesMin: 1,
  previewMinutesMax: 1440,
} as const;
