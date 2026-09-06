// Query-параметры HTTP всегда строки — `?active=false` приходит в DTO как
// `'false'`, а не `false`, и `@IsBoolean()` эту строку отклонит. Хелпер общий
// для всех списковых DTO (первый потребитель — ListClassesDto), чтобы каждый
// список не изобретал свой `@Transform`.
export function booleanFromQuery(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
