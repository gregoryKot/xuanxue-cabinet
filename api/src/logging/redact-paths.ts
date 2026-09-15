// Пути редакции логов (pino `redact.paths`) — правило CLAUDE.md: секреты и
// PII не попадают в логи. fast-redact поддерживает wildcard `*` на ОДНОМ
// уровне вложенности — `*.password` вырезает поле `password` под любым
// top-level ключом (req.body.password, user.password, …), где бы такой
// объект ни залогировали. Добавляешь в модель новое чувствительное поле
// (токен канала, пароль Zoom, финансовые данные) — дописывай путь сюда,
// а не полагайся на то, что «его никто не залогирует».
export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  // Секрет вебхука бота (ADR-0015, SECURITY §2) — тот же уровень, что
  // authorization/cookie: заголовок неотличим от самого секрета.
  'req.headers["x-telegram-bot-api-secret-token"]',
  // Email — PII, даже если пришёл в теле легитимного запроса (вход по ссылке).
  'req.body.email',
  // Код ссылки-приглашения школы (ADR-0030, POST /auth/join, /auth/join/check,
  // /auth/email/request) — capability-URL, тот же уровень, что email/hash.
  'req.body.code',
  'req.body.inviteCode',
  // Подпись виджета Telegram Login (POST /auth/telegram) — не секрет после
  // проверки (её вычисляют из открытых полей и BOT_TOKEN, не наоборот), но
  // редакция дёшева: путь на два уровня (req.body.hash), *.hash ниже её не
  // достаёт — wildcard fast-redact разворачивается только на одном уровне.
  'req.body.hash',
  '*.password',
  '*.zoomPassword',
  '*.zoomLink',
  // fast-redact сравнивает имя ключа точно — `*.zoomLink` не вырезает
  // разовую ссылку занятия, у неё своё имя поля (lessons.zoomLinkOverride).
  '*.zoomLinkOverride',
  '*.zoomPasswordOverride',
  // Свободный текст учителя (lessons.note) — личные заметки, не для лога.
  '*.note',
  // Текст рассылки (broadcasts.text) всегда содержит ссылку Zoom с паролем
  // (SECURITY §1 п.3) — тот же секрет, что и zoomLink, но под другим полем.
  '*.text',
  // deliveries.error сюда сознательно не входит: `*.error` вырезал бы поле
  // error из любой строки лога и ослепил бы отладку. Токен канала из текста
  // ошибки провайдера вычищается в ChannelsService (test()) и в сервисе
  // доставок, до записи в базу и до лога (SECURITY §6).
  '*.token',
  '*.accessToken',
  // Форма ВК (`access_token` в теле запроса messages.send) — snake_case,
  // отдельно от camelCase accessToken выше.
  '*.access_token',
  '*.refreshToken',
  '*.config',
  '*.secret',
  // Пользователь (ADR-0012, user.schema.ts): email и telegramId — PII и
  // ключ входа, могут попасть в лог не только через req.body (email уже
  // покрыт выше), а из любого объекта пользователя, который залогируют.
  '*.email',
  '*.telegramId',
  // Подпись виджета (см. req.body.hash выше) — на случай, если её залогируют
  // не только из req.body, а из другого объекта одним уровнем вложенности.
  '*.hash',
  // pino-http логирует res.getHeaders() целиком — свежий Set-Cookie при
  // входе и при rolling-перевыпуске содержит токен сессии открытым текстом.
  'res.headers["set-cookie"]',
];
