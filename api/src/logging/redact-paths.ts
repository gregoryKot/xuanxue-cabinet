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
  // Email — PII, даже если пришёл в теле легитимного запроса (вход по ссылке).
  'req.body.email',
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
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.config',
  '*.secret',
];
