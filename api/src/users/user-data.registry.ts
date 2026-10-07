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
// Этап 4, слой 4.2 (exam_videos, ADR-0133) — видео вопроса/варианта в R2,
// тем же смыслом и тем же решением, что exam_images выше: `createdBy` — кто
// загрузил, не признак владения, при удалении аккаунта поле обнуляется, само
// видео остаётся у вопроса банка.
//
// Этап 4, слой 4.6 (grading_comment_presets, ADR-0041) — заготовки частых
// комментариев при проверке. Данные школы, не ученика: `createdBy` — кто
// завёл заготовку, не признак владения (см. USER_REFERENCE_PATHS ниже) —
// при удалении аккаунта поле обнуляется, сама заготовка остаётся общей.
//
// События школы (school_events, ADR-0177) — ретрит, семинар, выезд. Данные
// школы, не ученика: `createdBy` — кто завёл событие, не признак владения (см.
// USER_REFERENCE_PATHS ниже) — при удалении аккаунта поле обнуляется, само
// событие остаётся на доске.
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
//
// Этап 2, слой 2.2 (payment_screenshots, ADR-0050) — байты снимка перевода.
// `userId` у коллекции нет: чей снимок, знает оплата
// (`payments.screenshotImageId`), поэтому в список владения она не входит —
// сверочный тест ниже сравнивает его именно со схемами, у которых путь
// `userId` есть. Удаление аккаунта тем не менее обязано унести и байты,
// иначе снимок ученика переживёт его аккаунт: для этого USER_OWNED_CASCADES
// ниже.
//
// ADR-0092, «Порядок работ» PR №3 (push_subscriptions) — подписка браузера
// на push: данные человека, `userId` — чьё устройство. Живёт, пока жив
// аккаунт, тем же путём, что NotificationPrefsRecord выше; удаление аккаунта
// обязано унести и её — иначе push продолжал бы падать на устройство
// удалённого человека молча.
//
// ADR-0129 (отзыв тестировщицы 2026-09-23) — exam_seen_marks: отметка
// «ученик открыл карточку задания», отдельно от попытки (её может не быть
// вовсе). Данные человека, `userId` — чья отметка; живёт, пока жив аккаунт,
// тем же путём, что NotificationPrefsRecord.
//
// ADR-0132 — app_errors (журнал сбоев, api/src/app-errors/app-error.schema.ts):
// сознательно НЕ про пользователя школы и не входит в реестр. У схемы нет
// поля `userId` вовсе — сбой не принадлежит тому, у кого он произошёл, чинит
// его админ, а не автор запроса; запись существует ради разбора причины, а
// не ради истории конкретного человека. Решение зафиксировано здесь явно,
// чтобы будущий ревьюер не спрашивал, почему коллекция с персональными по
// духу данными (userAgent, путь запроса) выпала из чеклиста CLAUDE.md
// «Новая коллекция» — она проходит его пунктом 1 честным «нет userId», не
// молчаливым пропуском.
// ADR-0137 (answer_videos) — загрузка видео-ответа частями: данные ученика,
// `userId` — чья загрузка, срок хранения — ANSWER_VIDEO_RETENTION (90 дней
// после проверки, год без неё), убирает AnswerVideoSweepService. Объект в R2
// — не документ Mongo, до него не достать `deleteMany` по владению, поэтому
// модель есть и здесь (сверка user-data.registry.spec.ts требует явного
// решения для КАЖДОЙ модели с userId), и в USER_OWNED_STORAGE_CASCADES ниже.
export const USER_OWNED_COLLECTIONS = [
  'ExamAttemptRecord',
  'NotificationPrefsRecord',
  'ExamGradingRecord',
  'MediaAssetRecord',
  'TelegramLinkCodeRecord',
  'PaymentRecord',
  'EmailLinkTokenRecord',
  'NotificationRecord',
  'PushSubscriptionRecord',
  'ExamSeenMarkRecord',
  'AnswerVideoRecord',
] as const;

// Имя модели пользователей по конвенции *Record этого проекта — совпадает с
// UserRecord.name в user.schema.ts (сверка — user-data.registry.spec.ts).
// Ссылки на пользователя (`ref:`) в других схемах сверяются с этим литералом
// в USER_REFERENCE_PATHS ниже.
export const USER_MODEL_NAME = 'UserRecord';

export type UserOwnedCollection = (typeof USER_OWNED_COLLECTIONS)[number];

// Данные человека, до которых не дотянуться по `userId`: ссылка на них идёт
// от документа владения (`payments.screenshotImageId` → `payment_screenshots`,
// ADR-0050). Удаление аккаунта читает ссылки ДО `deleteMany` по владению —
// после него читать будет нечего, и байты остались бы в базе навсегда.
// `from` обязан быть в USER_OWNED_COLLECTIONS, иначе каскад не сработает
// (сверка — user-data.registry.spec.ts).
export const USER_OWNED_CASCADES = [
  { from: 'PaymentRecord', path: 'screenshotImageId', model: 'PaymentScreenshotRecord' },
] as const;

// Данные во владении (USER_OWNED_COLLECTIONS), у которых есть путь `key` —
// адрес объекта в стороннем хранилище (R2), а не документ Mongo (ADR-0137):
// `deleteAllUserData` не достаёт до байтов простым `deleteMany`. Для каждой
// такой модели — своя запись здесь: ключ отдаётся журналу сирот
// (`StorageOrphansService.removeNow`) ДО удаления документа, `uploadIdPath`
// (если есть) — незаконченную multipart-загрузку раньше прерывает
// `abortMultipartUpload`. Сверка (user-data.registry.spec.ts): модель во
// владении с путём `key` в схеме обязана стоять здесь — иначе байты ученика
// пережили бы удалённый аккаунт молча.
export const USER_OWNED_STORAGE_CASCADES = [
  { model: 'AnswerVideoRecord', keyPath: 'key', uploadIdPath: 'uploadId' },
] as const;

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
  { model: 'ExamVideoRecord', path: 'createdBy' },
  { model: 'GradingCommentPresetRecord', path: 'createdBy' },
  { model: 'MaterialRecord', path: 'createdBy' },
  { model: 'SchoolEventRecord', path: 'createdBy' },
  { model: 'PaymentRecord', path: 'confirmedBy' },
] as const;
