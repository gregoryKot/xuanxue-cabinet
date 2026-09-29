#!/usr/bin/env node
// Куда идёт ночной бэкап: в приватный бакет R2 или, пока владелец его не завёл,
// в артефакт Actions (ADR-0152, RUNBOOK §7.1).
//
// Почему решение вынесено из workflow в скрипт: репозиторий публичный, артефакты
// публичного репозитория скачивает любой вошедший в GitHub (ADR-0017 писался для
// приватного репозитория и этого не учёл; репозиторий стал публичным 2026-09-12,
// ADR-0019). Если «куда класть» живёт в трёх `if:` внутри YAML, его нельзя
// проверить, и молчаливый возврат в артефакт пройдёт мимо CI. Здесь решение —
// чистая функция с тестом, а тест заодно сверяет с ним сам backup.yml.
//
// Пока R2 не настроен, бэкап не пропадает: уходит в артефакт, но громко — с
// аннотацией `::warning::` и сообщением в Telegram каждую ночь (`notice`).
// Значения секретов скрипт нигде не печатает: в тексты попадают только имена.
//
// Режимы CLI (env — из шагов backup.yml):
//   plan <файл>   решение + запись target/key/missing в $GITHUB_OUTPUT
//   warning       строка `::warning::` (BACKUP_R2_MISSING из вывода plan)
//   notice        текст сообщения в Telegram (BACKUP_R2_MISSING, RUN_URL)
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';

/** Четыре секрета GitHub Actions, которые вместе описывают бакет для бэкапов.
 * Не переменные приложения — в `.env.example` и в валидатор env не входят. */
export const R2_SECRET_NAMES = [
  'BACKUP_R2_ENDPOINT',
  'BACKUP_R2_BUCKET',
  'BACKUP_R2_ACCESS_KEY_ID',
  'BACKUP_R2_SECRET_ACCESS_KEY',
];

/** Ключи бэкапов в бакете лежат под этим префиксом, а не россыпью в корне. */
export const BACKUP_KEY_PREFIX = 'mongo/';

const RUNBOOK_REF = 'docs/RUNBOOK.md, раздел 7.1';
const NOTICE_TITLE = 'Бэкап Mongo лежит в публичном артефакте';

/** Секреты, которых нет. Пустое и «одни пробелы» — одно и то же: пробел в
 * секрете при вставке из буфера — обычная опечатка, а не настройка. */
export function missingR2Secrets(env) {
  return R2_SECRET_NAMES.filter((name) => !(env[name] ?? '').trim());
}

/**
 * `r2` — все четыре секрета заданы, артефакт не создаётся вовсе.
 * `artifact` — не хватает хотя бы одного: запасной путь, чтобы ночной бэкап не
 * останавливался, пока владелец не завёл бакет. Частично заданный набор — тоже
 * запасной путь: половина ключей бэкап никуда не загрузит.
 */
export function chooseDestination(env) {
  const missing = missingR2Secrets(env);
  return { target: missing.length === 0 ? 'r2' : 'artifact', missing };
}

/** Ключ объекта в бакете по пути локального файла. Имя файла уже несёт
 * UTC-метку (`backup-<метка>.archive.gz.enc`), поэтому ключ уникален. */
export function backupObjectKey(filePath) {
  const name = basename(String(filePath ?? '').trim());
  if (!name) throw new Error('не указан файл бэкапа');
  return `${BACKUP_KEY_PREFIX}${name}`;
}

/** Строки для $GITHUB_OUTPUT. */
export function githubOutputLines({ target, missing, key }) {
  return `target=${target}\nkey=${key}\nmissing=${missing.join(',')}\n`;
}

/** Обратно из строки вывода шага: `A,B` → `['A','B']`, пусто → `[]`. */
export function parseMissing(text) {
  return String(text ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Экранирование для команды `::warning::`: без него перевод строки обрывает
 * аннотацию, а `%` читается как начало escape-последовательности. */
export function escapeWorkflowCommand(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function missingPhrase(missing) {
  return missing.length > 0 ? `Не задано: ${missing.join(', ')}.` : 'Секреты не заданы.';
}

/** Аннотация на странице прогона — видна тому, кто открыл Actions, даже если
 * Telegram молчит. Одна строка. */
export function fallbackWarning({ missing }) {
  const text =
    'Бэкап ушёл в артефакт публичного репозитория: приватное хранилище R2 для ' +
    `бэкапов не настроено. ${missingPhrase(missing)} Шаги — ${RUNBOOK_REF}.`;
  return `::warning title=${NOTICE_TITLE}::${escapeWorkflowCommand(text)}`;
}

/** Сообщение владельцу в Telegram (без разметки — notify-telegram шлёт простой
 * текст). Приходит каждую ночь, пока секреты не заданы: это и есть напоминание. */
export function fallbackNotice({ missing, runUrl }) {
  const lines = [
    'Бэкап Mongo за эту ночь сделан, но лежит в артефакте Actions публичного ' +
      'репозитория. Скачать его может любой, у кого есть аккаунт GitHub. Файл ' +
      'зашифрован, и всё равно держать его там дольше необходимого не стоит.',
    '',
    `Приватное хранилище R2 для бэкапов ещё не настроено. ${missingPhrase(missing)} ` +
      `Заведите бакет и секреты по шагам: ${RUNBOOK_REF}.`,
    '',
    'Это сообщение будет приходить каждую ночь, пока секреты не заданы.',
  ];
  if (runUrl) lines.push('', `Прогон: ${runUrl}`);
  return lines.join('\n');
}

function cliPlan(filePath) {
  const { target, missing } = chooseDestination(process.env);
  const key = backupObjectKey(filePath);
  if (target === 'r2') {
    console.log(
      `Бэкап пойдёт в приватный бакет R2 (ключ ${key}), артефакт не создаётся.`,
    );
  } else {
    console.log(
      `R2 для бэкапов не настроен. ${missingPhrase(missing)} Бэкап пойдёт в артефакт.`,
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      githubOutputLines({ target, missing, key }),
    );
  }
}

function main() {
  const [mode, arg] = process.argv.slice(2);
  const missing = parseMissing(process.env.BACKUP_R2_MISSING);
  if (mode === 'plan') return cliPlan(arg);
  if (mode === 'warning') return console.log(fallbackWarning({ missing }));
  if (mode === 'notice') {
    return console.log(fallbackNotice({ missing, runUrl: process.env.RUN_URL }));
  }
  console.error('Использование: backup-destination.mjs plan <файл> | warning | notice');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(
      `❌ backup-destination: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}
