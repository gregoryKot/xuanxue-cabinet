// Правило «обе или ни одной» для переменных входа через Google (ADR-0145) —
// тот же приём, что у Cloudflare R2 (env.r2-group.ts) и VAPID
// (env.vapid-group.ts): половина набора — опечатка при настройке, не
// «выключенный вход», поэтому приложение не поднимается и называет, чего не
// хватает.
//
// Тип объявлен структурно, а не импортом `EnvSchema`: обратный импорт замкнул
// бы цикл (eslint `import-x/no-cycle`).
interface GoogleEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const GOOGLE_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const satisfies readonly (keyof GoogleEnv)[];

/** Пустой массив, когда заданы обе или ни одной — кабинет без Google-входа
 * поднимается как прежде (ADR-0145, env.validate.spec.ts). */
export function googleGroupMessages(env: GoogleEnv): string[] {
  const missing = GOOGLE_KEYS.filter((key) => !env[key]);
  if (missing.length === 0 || missing.length === GOOGLE_KEYS.length) return [];
  return [
    'Переменные GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET задаются обе или ' +
      `ни одной — не хватает: ${missing.join(', ')}`,
  ];
}
