#!/usr/bin/env node
// Канал уведомления: отправляет текст в Telegram-чат алертов через Bot API
// (RUNBOOK, раздел «Мониторинг» — «Алерты из GitHub Actions»). Секреты —
// TELEGRAM_ALERT_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID из GitHub Actions,
// не из .env.example: тот же случай, что BACKUP_MONGODB_URI/BACKUP_PASSPHRASE
// в backup.yml — секрет CI, не приложения.
//
// telegramRequest — чистая функция без похода в сеть, тестируется без mock
// fetch. CLI ниже отправляет запрос с таймаутом и одной повторной попыткой;
// токен нигде не печатается — redactToken вычищает его из любого текста
// перед выводом (сетевые ошибки node иногда несут URL целиком).
import process from 'node:process';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2; // таймаут 10с + одна повторная попытка

/** Тело POST к Bot API `sendMessage` — без `parse_mode`: свободный текст с
 * `_`/`*`/`[` не должен ломаться об экранирование markdown. */
export function telegramRequest({ token, chatId, text }) {
  return {
    url: `${TELEGRAM_API_BASE}/bot${token}/sendMessage`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    },
  };
}

/** Нет токена или чата — описание проблемы на русском; оба заданы — `null`. */
export function credentialsProblem({ token, chatId }) {
  if (token && chatId) return null;
  return (
    'TELEGRAM_ALERT_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID не заданы — алерт никуда не ушёл. ' +
    'Настройка секретов — docs/RUNBOOK.md, раздел «Мониторинг».'
  );
}

/** Убирает токен из текста перед печатью: и HTTP-, и сетевые ошибки узла
 * иногда несут в себе весь URL запроса, а он содержит токен. */
export function redactToken(text, token) {
  const asText = String(text);
  if (!token) return asText;
  return asText.split(token).join('***');
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function resolveText() {
  const argText = process.argv.slice(2).join(' ').trim();
  if (argText) return argText;
  if (process.stdin.isTTY) return ''; // ни argv, ни пайпа — отправлять нечего
  const piped = await readStdin();
  return piped.trim();
}

async function main() {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  const problem = credentialsProblem({ token, chatId });
  if (problem) {
    // Громкое предупреждение, но exit 0 — ронять сам workflow второй раз
    // незачем, он уже красный из-за того, что породило этот алерт.
    console.warn(`⚠ ${problem}`);
    return;
  }

  const text = await resolveText();
  if (!text) {
    console.warn('⚠ пустой текст алерта — отправлять нечего.');
    return;
  }

  const request = telegramRequest({ token, chatId, text });
  let lastFailure = 'нет ответа';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(request.url, {
        ...request.init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        console.log('✓ алерт отправлен в Telegram');
        return;
      }
      lastFailure = `HTTP ${res.status}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastFailure = redactToken(message, token);
    }
  }
  // Только код/описание — никогда request.url (несёт токен в пути).
  console.error(`❌ Telegram не принял сообщение: ${lastFailure}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `❌ notify-telegram: ${redactToken(message, process.env.TELEGRAM_ALERT_BOT_TOKEN)}`,
    );
  });
}
