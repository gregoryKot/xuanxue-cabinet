// Правило «все четыре или ни одной» для переменных Cloudflare R2 (ADR-0057) —
// отдельно от схемы окружения по той же причине, что и
// env.production-required.ts: `@ValidateIf` в class-validator применяет
// условие ко всем декораторам поля сразу, а нам нужно «формат проверяется
// всегда, обязательность — только вместе с соседями».
//
// Половина набора — не «выключенное хранилище», а опечатка при настройке:
// без неё загрузка молча не включилась бы, а учитель увидел бы экран без
// кнопки и не понял почему (CLAUDE.md «Логи»: тихий отказ — самая дорогая
// ошибка). Поэтому приложение не поднимается и говорит, чего не хватает.
//
// Тип объявлен структурно, а не импортом `EnvSchema`: обратный импорт замкнул
// бы цикл (eslint `import-x/no-cycle`).
interface R2Env {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
}

const R2_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const satisfies readonly (keyof R2Env)[];

/** Пустой массив, когда заданы все четыре или ни одной, — кабинет без
 * хранилища поднимается как прежде (ADR-0057, спека env.validation.spec.ts). */
export function r2GroupMessages(env: R2Env): string[] {
  const missing = R2_KEYS.filter((key) => !env[key]);
  if (missing.length === 0 || missing.length === R2_KEYS.length) return [];
  return [
    'Переменные Cloudflare R2 задаются все четыре или ни одной — ' +
      `не хватает: ${missing.join(', ')}`,
  ];
}
