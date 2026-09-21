// Правило «все три или ни одной» для переменных VAPID (ADR-0092) — тот же
// приём и та же причина, что у Cloudflare R2 (env.r2-group.ts): половина
// набора — опечатка при настройке, не «push выключен» (CLAUDE.md «Логи»:
// тихий отказ — самая дорогая ошибка), поэтому приложение не поднимается и
// называет, чего не хватает.
//
// Тип объявлен структурно, а не импортом `EnvSchema`: обратный импорт замкнул
// бы цикл (eslint `import-x/no-cycle`).
interface VapidEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

const VAPID_KEYS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const satisfies readonly (keyof VapidEnv)[];

/** Пустой массив, когда заданы все три или ни одной — кабинет без push
 * поднимается как прежде (ADR-0092, env.validate.spec.ts). */
export function vapidGroupMessages(env: VapidEnv): string[] {
  const missing = VAPID_KEYS.filter((key) => !env[key]);
  if (missing.length === 0 || missing.length === VAPID_KEYS.length) return [];
  return [
    'Переменные VAPID задаются все три или ни одной — ' +
      `не хватает: ${missing.join(', ')}`,
  ];
}
