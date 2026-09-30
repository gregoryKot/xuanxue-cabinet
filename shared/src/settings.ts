// DTO и константы API настроек школы (`/settings`) — шаблоны постов
// (docs/PLAN.md §6 «Шаблоны», ADR-0011). Общий контракт api и web
// (CLAUDE.md, раздел «Слои»).
import {
  DEFAULT_PAYMENT_REMINDER_TEMPLATE,
  type TemplateKind,
} from './default-templates';

/** Напоминание ученику об ежемесячной оплате (ADR-0051, PLAN §15 п. 2.5) —
 * настройка школы, живёт в БД и на экране «Шаблоны» (CLAUDE.md «Кабинет
 * учителя: всё настраивается в интерфейсе»). */
export interface PaymentReminderSettings {
  enabled: boolean;
  /** 'HH:mm' в поясе школы (settings.tz), формат RULE_TIME_RE из domain.ts. */
  time: string;
  /** Шаблон с подстановками `PAYMENT_REMINDER_PLACEHOLDERS` (templates.ts). */
  template: string;
}

/** Значения напоминания для базы без поля `paymentReminder` (старый документ
 * школы) — не источник правды, тот же приём, что у `DEFAULT_PREVIEW_MINUTES`
 * (domain.ts). Лежит здесь, а не рядом с ними: значению нужны тип выше и
 * шаблон из default-templates.ts, который сам импортирует domain.ts, — в
 * domain.ts получился бы цикл импортов. */
export const DEFAULT_PAYMENT_REMINDER: PaymentReminderSettings = {
  // Выключено, пока экраны «Оплаты» (слой 2.3) и ученика (2.4) не сделаны:
  // отметить оплату бухгалтеру негде, и включённое по умолчанию напоминание
  // ушло бы ученикам, которых о нём никто не предупредил. Включает школа сама
  // на экране «Шаблоны», выбрав время.
  enabled: false,
  // 10:00 — стартовое значение формы, школа меняет. Дня у школы нет: его
  // выбирает каждый ученик сам, не выбравшему напоминание не приходит (ADR-0161).
  time: '10:00',
  template: DEFAULT_PAYMENT_REMINDER_TEMPLATE,
};

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
  /** За сколько минут до начала занятия ученику приходит напоминание — лента
   * кабинета и push (`LessonReminderService`, ADR-0135) — настройка школы,
   * тем же приёмом, что `previewMinutes` выше: старая база без поля отдаёт
   * `DEFAULT_LESSON_REMINDER_MINUTES` (domain.ts). */
  lessonReminderMinutes: number;
  /** Кому писать новичку — этот контакт бот называет незнакомцу
   * (ADR-0115). Старая база без поля отдаёт `DEFAULT_NEWCOMER_CONTACT`
   * (domain.ts), тем же приёмом, что `previewMinutes`. */
  newcomerContact: string;
  /** Кому ученик присылает скриншот перевода (ADR-0159): его видят в
   * «Профиле» и в напоминании об оплате (подстановка `{контакт}`). Старая база
   * без поля отдаёт `DEFAULT_PAYMENT_CONTACT` (domain.ts), тем же приёмом, что
   * `newcomerContact`. */
  paymentContact: string;
  /** Кто отвечает за данные учеников — имя человека или название школы
   * (статья 11 Закона о защите частной жизни Израиля: просить данные можно,
   * только назвав, кто ими владеет). Публичный текст: отдаётся всем через
   * `GET /auth/config` и стоит на странице `/privacy` (ADR-0145). Поля нет,
   * пока школа не заполнила экран «Шаблоны»: страница тогда честно
   * отправляет к учителю, а не выдумывает имя. */
  dataControllerName?: string;
  /** Как связаться с ответственным по вопросам о данных (почта, телефон,
   * Telegram) — читается вместе с `dataControllerName`, тем же приёмом. Это же
   * адрес, куда страница `/accessibility` просит писать о проблемах с
   * доступностью (ADR-0158): второй настройки нет. */
  dataControllerContact?: string;
  /** Старая база без поля отдаёт `DEFAULT_PAYMENT_REMINDER` целиком, а база
   * с частично заполненным подобъектом — недостающие поля из него же. */
  paymentReminder: PaymentReminderSettings;
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
  /** Целое число минут (`SETTINGS_LIMITS.lessonReminderMinutesMin`…`Max`) —
   * та же причина, что `previewMinutes`: сбросить в «нет значения» нельзя,
   * только заменить другим числом. */
  lessonReminderMinutes?: number;
  /** Не в NULLABLE_SETTINGS_FIELDS, по той же причине, что `previewMinutes`:
   * «сбросить в ничто» смысла не имеет — контакт можно только заменить
   * другим. Пустая строка не проходит валидацию, иначе бот оборвал бы фразу
   * «Напишите …» на полуслове. */
  newcomerContact?: string;
  /** Не в NULLABLE_SETTINGS_FIELDS, по той же причине, что `newcomerContact`:
   * пустой контакт оборвал бы фразу «пришлите … в Telegram» на полуслове. */
  paymentContact?: string;
  /** `null` — явный сброс (NULLABLE_SETTINGS_FIELDS): пустое поле формы
   * значит «не указано», страница `/privacy` тогда отправляет к учителю. */
  dataControllerName?: string | null;
  dataControllerContact?: string | null;
  /** PATCH меняет только переданные поля подобъекта, остальные не трогает
   * (как `templates` выше). Не nullable: «сбросить в ничто» смысла не имеет. */
  paymentReminder?: Partial<PaymentReminderSettings>;
}

/** Nullable-поля UpdateSettingsInput — источник правды для DTO
 * (`@IsOptional()` вместо `OptionalNotNull()`) и для `splitUpdate`, тот же
 * приём, что у NULLABLE_CLASS_FIELDS/NULLABLE_LESSON_FIELDS. */
export const NULLABLE_SETTINGS_FIELDS = [
  'schoolSiteUrl',
  'dataControllerName',
  'dataControllerContact',
] as const;

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
  newcomerContactMaxLength: 200,
  paymentContactMaxLength: 200,
  dataControllerNameMaxLength: 200,
  dataControllerContactMaxLength: 300,
  previewMinutesMin: 1,
  previewMinutesMax: 1440,
  lessonReminderMinutesMin: 5,
  lessonReminderMinutesMax: 1440,
  paymentReminderDayMin: 1,
  paymentReminderDayMax: 31,
} as const;
