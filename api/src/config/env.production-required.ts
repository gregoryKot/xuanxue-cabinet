// Правила «обязателен в production» — отдельно от схемы окружения:
// env.validation.ts упёрся в файл-храповик (CLAUDE.md «Храповики»: файл
// больше 150 строк дробится, а не пухнет дальше). class-validator
// `@ValidateIf` применяет одно условие ко ВСЕМ декораторам поля сразу,
// поэтому «обязателен в prod, но формат проверяется всегда» выражаем явным
// списком здесь, а не кастомным валидатором.
//
// Тип параметра объявлен структурно, а не импортом `EnvSchema`: обратный
// импорт из env.validation.ts замкнул бы цикл (eslint `import-x/no-cycle`).
interface ProductionRequiredEnv {
  DEPLOY_PROFILE: string;
  ENCRYPTION_KEY?: string;
  JWT_SECRET?: string;
  PUBLIC_URL?: string;
  BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

// BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в списке с 2026-09-08: без них
// приложение поднималось с мёртвым ботом — `/start` не доходил, а
// единственным признаком был 503 на вебхуке, которого никто не видит
// (нашли вручную при первом тестировании). CLAUDE.md «Логи»: тихий отказ —
// самая дорогая ошибка в продукте про рассылки, поэтому лучше не подняться
// на старте с перечнем недостающего, чем работать наполовину.
const REQUIRED_IN_PRODUCTION = [
  'ENCRYPTION_KEY',
  'JWT_SECRET',
  'PUBLIC_URL',
  'BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
] as const satisfies readonly (keyof ProductionRequiredEnv)[];

// Прод и стейджинг оба идут с NODE_ENV=production, а `local` — значение по
// умолчанию: без явного профиля cookie сессии ушла бы без Secure и без общего
// домена wiki (ADR-0183).
const DEPLOY_PROFILE_LOCAL_MESSAGE =
  'DEPLOY_PROFILE обязателен в production: production или staging';

/** Сообщения о незаполненных переменных, обязательных в production —
 * пустой массив, если всё на месте. */
export function productionRequiredMessages(env: ProductionRequiredEnv): string[] {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !env[key]).map(
    (key) => `${key} обязателен в production`,
  );
  if (env.DEPLOY_PROFILE === 'local') missing.push(DEPLOY_PROFILE_LOCAL_MESSAGE);
  return missing;
}
