// Виды ожидания бота в чате (bot_sessions.kind) — вынесено из
// bot-session.schema.ts (файл-лимит CLAUDE.md «Файлы»,
// check-file-size-ratchet.mjs: схема уже на потолке храповика): список видов
// и абзац на каждый растёт с каждым новым диалогом бота, а сама схема — нет.
// 'topic'/'recording' объясняет заголовок bot-session.schema.ts (там же
// лежат поля lessonId).
//
// 'examMedia' (ADR-0023, PLAN §11 слой 4.5) — ждём видео для попытки; либо
// после deep link `t.me/<бот>?start=exam_<attemptId>` из кабинета (тогда
// `questionIndex` не задан), либо с экрана вопроса-видео внутри самого бота
// (ТЗ 4б.2, часть 2 — `questionIndex` задан, после привязки бот сразу
// показывает следующий вопрос). В отличие от topic/recording заводится
// ЛЮБОМУ пользователю Telegram, не только штату школы (экзамен сдают
// ученики) — несёт `attemptId`, не `lessonId`.
// 'examText' (ТЗ 4б.2, часть 2) — ждём свободный текст ответа на вопрос
// попытки; всегда с `questionIndex`, тем же приёмом, что examMedia.
// 'examItemDraft' (ТЗ 4б.3, PLAN.md §12, ADR-0024) — учитель заводит вопрос в
// боте: четыре шага (тип → формулировка → варианты → критерии), черновик
// копится в draft*-полях bot-session.schema.ts, а не в отдельной коллекции —
// тем же приёмом, что topic/recording хранят `lessonId` прямо на сессии.
// Открыт только штату (personal-chats.ts), в отличие от examMedia/examText.
// 'examBuildDraft' (ТЗ 4б.4, PLAN.md §12, ADR-0024) — учитель собирает
// экзамен из уже опубликованных вопросов: отметка → название → лимит
// времени → число попыток → подтверждение. Черновик копится в build*-полях
// bot-session.schema.ts, тем же приёмом, что draft*-поля у examItemDraft.
// Открыт только штату, как examItemDraft.
// 'gradeComment' (ТЗ 4б.5, PLAN.md §12) — проверяющий выбрал итог («Зачёт»/
// «Доработать»/«Незачёт», grade-callback.handler.ts) и вводит комментарий
// одним сообщением или жмёт «Без комментария»; несёт `attemptId` (как
// examMedia/examText) и `outcome` — выбор запоминаем на сессии, а не просим
// повторно после текста. Открыт только штату, тем же приёмом, что examItemDraft.
// 'payment' (ADR-0050, docs/PLAN.md §15 слой 2.2) — ждём скриншот оплаты
// после deep link `t.me/<бот>?start=pay_<YYYY-MM>` (start-payload.ts,
// payment-screenshot-deep-link.ts). В отличие от topic/recording заводится
// ЛЮБОМУ пользователю Telegram (скриншоты шлют ученики), несёт `month`, не
// lessonId/attemptId.
export const BOT_SESSION_KINDS = [
  'topic',
  'recording',
  'examMedia',
  'examText',
  'examItemDraft',
  'examBuildDraft',
  'gradeComment',
  'payment',
] as const;
export type BotSessionKind = (typeof BOT_SESSION_KINDS)[number];
