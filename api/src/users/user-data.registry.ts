// Реестр коллекций с пользовательскими данными — чеклист CLAUDE.md «Новая
// коллекция с полем userId»: удаление аккаунта и слияние аккаунтов идут по
// этому списку, забытая здесь модель означает данные, которые не удаляются
// или не переносятся при merge. Наследовано из telegram-bot-2
// (USER_DATA_TABLES / USER_OWNED_TABLES), адаптировано под Mongoose.
//
// Этап 1: данные школы (classes, lessons, channels, broadcasts, deliveries)
// принадлежат школе, а не пользователю (ADR-0010) — userId у них нет, список
// остаётся пуст. У них есть ссылки НА пользователя (кто ведёт, кто создал) —
// они не про владение и сюда не входят, но их обязан переписать/обнулить тот
// же merge/delete, поэтому у них свой реестр ниже.
//
// Этап 4, слой 4.4: первая коллекция с userId — попытка сдачи экзамена
// (данные ученика, ADR-0022 + PLAN §11): удаление аккаунта уносит и её.
//
// notification_prefs (ТЗ notifications-api.md) — вторая: настройки уведомлений
// живут, пока жив аккаунт, удаление уносит их тем же путём.
//
// Этап 4, слой 4.6: оценка попытки (exam_gradings, ADR-0022 и ADR-0038,
// PLAN §11) — тоже данные ученика (чью работу проверили), срок хранения
// «вместе с попыткой». `graderId` (кто проверил) — не признак владения, обычная ссылка
// на пользователя, см. USER_REFERENCE_PATHS ниже.
//
// Этап 4, слой 4.5 (media_assets, ADR-0023, PLAN §11) — способ добраться до
// видео экзамена (file_id, ссылка или ручная отметка), не сами байты. Данные
// ученика: `userId` — чья попытка, срок хранения «вместе с попыткой», как у
// exam_gradings. Само видео живёт в чатах Telegram или на стороннем
// хостинге — его удаляет владелец чата/хостинга, не мы (ADR-0023).
//
// Этап 4, слой 4.2 (exam_images, ADR-0035) — байты картинки варианта
// ответа. Данные школы, не ученика: `createdBy` — кто загрузил, не признак
// владения (см. USER_REFERENCE_PATHS ниже) — при удалении аккаунта поле
// обнуляется, сама картинка остаётся у вопроса банка.
//
// Этап 4, слой 4.6 (grading_comment_presets, ADR-0041) — заготовки частых
// комментариев при проверке. Данные школы, не ученика: `createdBy` — кто
// завёл заготовку, не признак владения (см. USER_REFERENCE_PATHS ниже) —
// при удалении аккаунта поле обнуляется, сама заготовка остаётся общей.
//
// Этап 3, слой 3.1 (materials, ADR-0047, PLAN §14) — библиотека материалов
// школы. Данные школы, не ученика: `createdBy` — кто завёл материал, не
// признак владения (см. USER_REFERENCE_PATHS ниже) — при удалении аккаунта
// поле обнуляется, сам материал остаётся в библиотеке школы.
//
// ADR-0034 — код связки Telegram (telegram_link_codes,
// telegram-link-code.schema.ts): `userId` здесь не персональные данные
// ученика, а признак того, чья сессия выпустила код (владелец, а не жертва
// удаления). Внесён в реестр не ради переноса при merge/delete — живёт
// минуты и почти всегда пуст к моменту удаления аккаунта, — а потому что
// сверочный тест ниже требует явного решения для КАЖДОЙ модели с путём
// userId, а не молчаливого пропуска.
//
// Этап 2, слой 2.1 (payments, PLAN.md §15, ADR-0049) — абонемент по
// месяцам: данные ученика (деньги конкретного человека, ADR-0010 наоборот),
// живёт, пока жив аккаунт — финансовый след школы, не свободный текст.
//
// ADR-0059 — токен подтверждения привязки почты (email_link_tokens,
// email-link-token.schema.ts): userId здесь тоже признак того, чья сессия
// привязывает адрес (владелец, не жертва удаления), тем же доводом, что у
// telegram_link_codes выше — живёт минуты и почти всегда пуст к моменту
// удаления аккаунта, внесён ради явного решения в сверочном тесте, а не
// ради переноса при merge/delete.
//
// Слой in-app уведомлений (notifications, ADR-0061) — лента кабинета
// (InAppExamNotifier, третье плечо ExamNotifier рядом с Telegram и почтой):
// данные человека, `userId` — кому адресована запись. Срок хранения и так
// короткий — TTL-индекс 90 дней (notification.schema.ts), удаление аккаунта
// не ждёт его: уносит записи сразу, тем же путём, что и остальные.
export const USER_OWNED_COLLECTIONS = [
  'ExamAttemptRecord',
  'NotificationPrefsRecord',
  'ExamGradingRecord',
  'MediaAssetRecord',
  'TelegramLinkCodeRecord',
  'PaymentRecord',
  'EmailLinkTokenRecord',
  'NotificationRecord',
] as const;

// Имя модели пользователей по конвенции *Record этого проекта — совпадает с
// UserRecord.name в user.schema.ts (сверка — user-data.registry.spec.ts).
// Ссылки на пользователя (`ref:`) в других схемах сверяются с этим литералом
// в USER_REFERENCE_PATHS ниже.
export const USER_MODEL_NAME = 'UserRecord';

export type UserOwnedCollection = (typeof USER_OWNED_COLLECTIONS)[number];

// Ссылки на пользователя в данных школы: слияние аккаунтов переписывает их на
// новый id (`$set`), удаление аккаунта — обнуляет (`$unset`). Не признак
// владения (ADR-0010) — просто поле, которое не должно указывать в никуда.
export const USER_REFERENCE_PATHS = [
  { model: 'ClassRecord', path: 'leaderId' },
  { model: 'LessonRecord', path: 'leaderId' },
  { model: 'ChannelRecord', path: 'createdBy' },
  { model: 'BroadcastRecord', path: 'createdBy' },
  { model: 'ExamItemRecord', path: 'authorId' },
  { model: 'ExamRecord', path: 'createdBy' },
  { model: 'ExamGradingRecord', path: 'graderId' },
  { model: 'ExamImageRecord', path: 'createdBy' },
  { model: 'GradingCommentPresetRecord', path: 'createdBy' },
  { model: 'MaterialRecord', path: 'createdBy' },
  { model: 'PaymentRecord', path: 'confirmedBy' },
] as const;
