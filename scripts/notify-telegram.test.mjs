// Тест чистой части notify-telegram.mjs: сборка запроса, решение о
// секретах и вычищение токена из текста — без сети (RUNBOOK, раздел
// «Мониторинг»). CLI-обёртка (main) не тестируется юнитом — тот же приём,
// что у обёрток над spawnSync в scripts/git-refs.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramRequest, credentialsProblem, redactToken } from './notify-telegram.mjs';

test('telegramRequest: POST, JSON, disable_web_page_preview, без parse_mode', () => {
  const { url, init } = telegramRequest({
    token: 'TOKEN123',
    chatId: '42',
    text: 'прод лежит',
  });

  assert.equal(url, 'https://api.telegram.org/botTOKEN123/sendMessage');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  const body = JSON.parse(init.body);
  assert.equal(body.chat_id, '42');
  assert.equal(body.text, 'прод лежит');
  assert.equal(body.disable_web_page_preview, true);
  assert.equal(body.parse_mode, undefined); // текст не должен ломаться об экранирование
});

test('credentialsProblem: оба секрета заданы — null', () => {
  assert.equal(credentialsProblem({ token: 'T', chatId: 'C' }), null);
});

test('credentialsProblem: нет токена — описание проблемы, а не исключение', () => {
  const problem = credentialsProblem({ token: undefined, chatId: 'C' });
  assert.match(problem, /TELEGRAM_ALERT_BOT_TOKEN/);
});

test('credentialsProblem: нет чата — описание проблемы', () => {
  const problem = credentialsProblem({ token: 'T', chatId: undefined });
  assert.match(problem, /TELEGRAM_ALERT_CHAT_ID/);
});

test('credentialsProblem: ни одного секрета — тоже описание, не бросает', () => {
  assert.match(credentialsProblem({ token: undefined, chatId: undefined }), /не заданы/);
});

test('redactToken: убирает токен из текста ошибки', () => {
  const message = 'fetch failed: https://api.telegram.org/botSECRET42/sendMessage';
  const cleaned = redactToken(message, 'SECRET42');
  assert.doesNotMatch(cleaned, /SECRET42/);
  assert.match(cleaned, /\*\*\*/);
});

test('redactToken: без токена — текст возвращается как есть', () => {
  assert.equal(redactToken('просто ошибка', undefined), 'просто ошибка');
});

test('redactToken: токен встречается несколько раз — вычищаются все вхождения', () => {
  const cleaned = redactToken('AAA-TOK-BBB-TOK-CCC', 'TOK');
  assert.doesNotMatch(cleaned, /TOK/);
});
