// Сверка подрядчиков со страницы /privacy (PRIVACY_RECIPIENTS, shared/src/privacy.ts)
// с тем, что в кабинете подключено на самом деле: переменные окружения,
// внешние источники CSP, ночной бэкап. Зачем: закон (статья 11) требует
// назвать, кому уходят данные, а подрядчик, о котором страница молчит, — это
// незаявленная передача. Страница писалась под вход через Google, и PostHog
// (ADR-0143) с копиями базы в GitHub (ADR-0017) в неё не попали — никто не
// сверял список с системой (ADR-0155).
//
// Механизм — как у encryption-coverage.spec.ts: каждая переменная из
// .env.example обязана получить решение. Новая служба = новая переменная или
// новый хост в CSP = красный тест, пока автор не назовёт её подрядчика (и не
// допишет строку в PRIVACY_RECIPIENTS) либо не объяснит, почему данные людей
// через неё не идут. Сети и Mongo нет — читаются три файла репозитория.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BACKUP_RETENTION_DAYS,
  POSTHOG_HOST,
  PRIVACY_RECIPIENTS,
  type PrivacyRecipientId,
} from '@xuanxue/shared';
import { CSP_DIRECTIVES } from './csp';

const REPO_ROOT = join(__dirname, '..', '..', '..');

// Переменная → подрядчик, которому она открывает данные (или на чьей стороне
// работает кабинет).
const ENV_RECIPIENT: Record<string, PrivacyRecipientId> = {
  MONGODB_URI: 'mongodb-atlas',
  PORT: 'railway',
  RAILWAY_GIT_COMMIT_SHA: 'railway',
  BOT_TOKEN: 'telegram',
  TELEGRAM_WEBHOOK_SECRET: 'telegram',
  RESEND_API_KEY: 'resend',
  MAIL_FROM: 'resend',
  GOOGLE_CLIENT_ID: 'google',
  GOOGLE_CLIENT_SECRET: 'google',
  R2_ACCOUNT_ID: 'cloudflare-r2',
  R2_ACCESS_KEY_ID: 'cloudflare-r2',
  R2_SECRET_ACCESS_KEY: 'cloudflare-r2',
  R2_BUCKET: 'cloudflare-r2',
  VAPID_PUBLIC_KEY: 'push-services',
  VAPID_PRIVATE_KEY: 'push-services',
  VAPID_SUBJECT: 'push-services',
  POSTHOG_KEY: 'posthog',
};

// Переменные, через которые данные людей наружу не идут, — с причиной.
const ENV_WITHOUT_RECIPIENT: Record<string, string> = {
  LOG_LEVEL: 'уровень логов',
  SCHEDULER_ENABLED: 'включатель планировщика',
  JWT_SECRET: 'секрет подписи сессий, остаётся на сервере',
  ENCRYPTION_KEY: 'ключ шифрования, остаётся на сервере',
  ENCRYPTION_KEY_OLD: 'прежние ключи шифрования, остаются на сервере',
  PUBLIC_URL: 'адрес самого кабинета',
  BOOTSTRAP_ADMIN_TELEGRAM_ID: 'id первого админа, наружу не уходит',
  HEARTBEAT_PING_URL: 'пустой GET «сервис жив», без данных людей (ADR-0112)',
};

// Внешний источник CSP → подрядчик.
const HOST_RECIPIENT: Record<string, PrivacyRecipientId> = {
  [POSTHOG_HOST]: 'posthog',
  'https://*.r2.cloudflarestorage.com': 'cloudflare-r2',
};

// Внешние источники CSP, куда кабинет данные не передаёт, — с причиной.
const HOST_WITHOUT_RECIPIENT: Record<string, string> = {
  'https://www.youtube-nocookie.com':
    'встроенное видео браузер открывает сам после нажатия, школа ничего не передаёт; на странице — отдельная строка',
  'https://rutube.ru':
    'встроенное видео браузер открывает сам после нажатия, школа ничего не передаёт; на странице — отдельная строка',
};

// Значения CSP, которые не являются внешним хостом.
const NOT_A_HOST = new Set(["'self'", "'none'", 'data:', 'https:']);

function readRepoFile(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), 'utf8');
}

function envExampleKeys(): string[] {
  const keys: string[] = [];
  for (const line of readRepoFile('.env.example').split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match?.[1]) keys.push(match[1]);
  }
  return keys;
}

function externalCspHosts(): string[] {
  const values: readonly string[] = Object.values(CSP_DIRECTIVES).flat();
  return [...new Set(values.filter((value) => !NOT_A_HOST.has(value)))];
}

describe('подрядчики на странице /privacy', () => {
  it('каждая переменная из .env.example названа: подрядчик из списка или причина, почему данные не уходят', () => {
    const decided = new Set([
      ...Object.keys(ENV_RECIPIENT),
      ...Object.keys(ENV_WITHOUT_RECIPIENT),
    ]);

    const undecided = envExampleKeys().filter((key) => !decided.has(key));

    // Новая переменная: если она открывает службу, куда уходят данные людей,
    // допишите её в PRIVACY_RECIPIENTS (shared/src/privacy.ts) и в
    // ENV_RECIPIENT; иначе — в ENV_WITHOUT_RECIPIENT с причиной.
    expect(undecided).toEqual([]);
  });

  it('в решениях нет переменных, которых уже нет в .env.example', () => {
    const present = new Set(envExampleKeys());
    const stale = [
      ...Object.keys(ENV_RECIPIENT),
      ...Object.keys(ENV_WITHOUT_RECIPIENT),
    ].filter((key) => !present.has(key));

    expect(stale).toEqual([]);
  });

  it('переменная не может быть и у подрядчика, и «без подрядчика» одновременно', () => {
    const both = Object.keys(ENV_RECIPIENT).filter((key) => key in ENV_WITHOUT_RECIPIENT);

    expect(both).toEqual([]);
  });

  it('каждый внешний источник CSP назван: подрядчик из списка или причина', () => {
    const decided = new Set([
      ...Object.keys(HOST_RECIPIENT),
      ...Object.keys(HOST_WITHOUT_RECIPIENT),
    ]);

    const undecided = externalCspHosts().filter((host) => !decided.has(host));

    expect(undecided).toEqual([]);
  });

  // Прямой довод, ради которого механизм заведён (ADR-0143): хост PostHog в
  // CSP означает, что PostHog обязан быть на странице.
  it('POSTHOG_HOST в CSP — PostHog есть в списке подрядчиков', () => {
    expect(externalCspHosts()).toContain(POSTHOG_HOST);
    expect(HOST_RECIPIENT[POSTHOG_HOST]).toBe('posthog');
    expect(PRIVACY_RECIPIENTS.map((recipient) => recipient.id)).toContain('posthog');
  });

  // Копии базы уходят в закрытый R2 (ADR-0152), а пока секреты R2 не заданы —
  // запасным путём в артефакт GitHub. Оба получателя называют страницу, срок
  // копий на странице — та же константа, что `retention-days`.
  it('копии базы: R2 и запасной артефакт GitHub есть в списке, срок тот же, что в тексте', () => {
    const backupWorkflow = readRepoFile('.github', 'workflows', 'backup.yml');
    const ids = PRIVACY_RECIPIENTS.map((recipient) => recipient.id);

    // Запасной путь убрали (последствия ADR-0152) — этот тест краснеет:
    // уберите GitHub из PRIVACY_RECIPIENTS, страница не должна называть его зря.
    expect(backupWorkflow).toContain('actions/upload-artifact');
    expect(backupWorkflow).toContain(`retention-days: ${BACKUP_RETENTION_DAYS}`);
    expect(ids).toContain('github');
    expect(backupWorkflow).toContain('BACKUP_R2_BUCKET');
    expect(ids).toContain('cloudflare-r2');
  });

  it('каждый подрядчик из списка подтверждён системой: переменной, хостом CSP или бэкапом', () => {
    const confirmed = new Set<string>([
      ...Object.values(ENV_RECIPIENT),
      ...Object.values(HOST_RECIPIENT),
      'github', // запасной путь бэкапа — проверка выше
    ]);

    const unconfirmed = PRIVACY_RECIPIENTS.map((recipient) => recipient.id).filter(
      (id) => !confirmed.has(id),
    );

    // Подрядчика убрали из системы, а страница о нём говорит — она врёт в
    // другую сторону; уберите строку из PRIVACY_RECIPIENTS.
    expect(unconfirmed).toEqual([]);
  });

  it('у каждого подрядчика есть имя и назначение, а маркера акцента в них нет', () => {
    for (const { name, purpose } of PRIVACY_RECIPIENTS) {
      expect(name.trim()).not.toBe('');
      expect(purpose.trim()).not.toBe('');
      expect(`${name}${purpose}`).not.toContain('**');
    }
  });
});
