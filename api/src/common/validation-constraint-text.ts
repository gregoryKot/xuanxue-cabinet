// Русский текст для каждого типа ограничения class-validator (CLAUDE.md,
// раздел «Ошибки»): без exceptionFactory в app.setup.ts ValidationPipe отдаёт
// пользователю английские шаблоны по умолчанию («title must be a string») —
// сюда переводим. Используется только через constraintText() ниже —
// formatValidationErrors (validation-messages.ts) добавляет подпись поля.
//
// Тексты — по docs/VOICE.md: без канцелярита, действие короткой фразой.
// Строчные буквы — это продолжение фразы «Поле: …».

// Суффикс дефолтного сообщения class-validator для типа ограничения — общий
// для всех полей: eachPrefix варьирует только начало строки («each value
// in »), не хвост. Не совпал ни один — считаем message кастомным
// (задан явно в декораторе DTO) и оставляем как есть.
const DEFAULT_SUFFIX: Partial<Record<string, RegExp>> = {
  isString: /must be a string$/,
  isNotEmpty: /should not be empty$/,
  isDefined: /should not be null or undefined$/,
  maxLength: /must be shorter than or equal to \d+ characters$/,
  minLength: /must be longer than or equal to \d+ characters$/,
  isUrl: /must be a URL address$/,
  isInt: /must be an integer number$/,
  isNumber: /must be a number conforming to the specified constraints$/,
  min: /must not be less than -?\d+(\.\d+)?$/,
  max: /must not be greater than -?\d+(\.\d+)?$/,
  isBoolean: /must be a boolean value$/,
  isIn: /must be one of the following values: .+$/,
  isMongoId: /must be a mongodb id$/,
  isIso8601: /must be a valid ISO 8601 date string$/,
  matches: /must match .+ regular expression$/,
  isArray: /must be an array$/,
  arrayMaxSize: /must contain no more than \d+ elements$/,
  arrayMinSize: /must contain at least \d+ elements$/,
  arrayNotEmpty: /should not be empty$/,
  arrayUnique: /'s elements must be unique$/,
  isObject: /must be an object$/,
  isTimeZone: /must be a valid IANA time-zone$/,
  isPositive: /must be a positive number$/,
  whitelistValidation: /should not exist$/,
  nestedValidation: /must be either object or array$/,
};

// Число зашито в дефолтном сообщении class-validator (own constraint value
// в рантайме нам не доступен — только текст) — вынимаем его оттуда через
// replace с $1, а не храним дубль лимита здесь (иначе разъедется с
// CLASS_LIMITS/LESSON_LIMITS при следующей правке). Совпадение гарантирует
// DEFAULT_SUFFIX в constraintText(), поэтому запасной ветки «не нашли» нет.
function replaceTail(re: RegExp, replacement: string): (message: string) => string {
  return (message) => message.replace(re, replacement);
}

const TRANSLATORS: Record<string, (message: string) => string> = {
  isString: () => 'должно быть текстом.',
  isNotEmpty: () => 'заполните поле.',
  isDefined: () => 'обязательное поле.',
  maxLength: replaceTail(/^.* (\d+) characters$/, 'не длиннее $1 символов.'),
  minLength: replaceTail(/^.* (\d+) characters$/, 'не короче $1 символов.'),
  // Реальные isUrl-поля (zoomLink, url в /classes и /lessons) требуют https
  // (`protocols: ['https']`) — единственное исключение, photo_url виджета
  // Telegram, любой протокол не проверяет и почти никогда не приходит битым
  // от самого виджета.
  isUrl: () => 'должна начинаться с https://.',
  isInt: () => 'должно быть целым числом.',
  isNumber: () => 'должно быть числом.',
  min: replaceTail(/^.*less than (-?\d+(?:\.\d+)?)$/, 'не меньше $1.'),
  max: replaceTail(/^.*greater than (-?\d+(?:\.\d+)?)$/, 'не больше $1.'),
  isBoolean: () => 'должно быть да или нет.',
  isIn: replaceTail(/^.*values: (.+)$/, 'допустимые значения: $1.'),
  isMongoId: () => 'неверный идентификатор.',
  isIso8601: () => 'дата и время в формате ISO, например 2026-09-08T19:00:00Z.',
  matches: () => 'неверный формат.',
  isArray: () => 'должно быть списком.',
  arrayMaxSize: replaceTail(/^.* (\d+) elements$/, 'не больше $1 элементов.'),
  arrayMinSize: replaceTail(/^.* (\d+) elements$/, 'не меньше $1 элементов.'),
  arrayNotEmpty: () => 'выберите хотя бы один вариант.',
  arrayUnique: () => 'значения повторяются, уберите дубли.',
  isObject: () => 'неверный формат настроек.',
  isTimeZone: () => 'укажите часовой пояс IANA, например Asia/Jerusalem.',
  isPositive: () => 'должно быть положительным числом.',
  whitelistValidation: () => 'поле не поддерживается.',
  nestedValidation: () => 'неверный формат.',
};

/**
 * Текст одного ограничения на русском без подписи поля впереди (её
 * добавляет formatValidationErrors). Дефолтное сообщение class-validator —
 * по словарю выше; своё, заданное `message:` в декораторе DTO, — как есть:
 * автор уже написал специфичный текст (например, у ScheduleRuleDto.time —
 * «в формате ЧЧ:ММ, например 19:00.», у него нет одного «правильного»
 * дефолта из таблицы).
 */
export function constraintText(constraintKey: string, message: string): string {
  const pattern = DEFAULT_SUFFIX[constraintKey];
  const translate = TRANSLATORS[constraintKey];
  if (pattern && translate && pattern.test(message)) return translate(message);
  return message;
}
