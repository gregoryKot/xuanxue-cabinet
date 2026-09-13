#!/usr/bin/env node
// Гейт на потолок CLAUDE.md (сам файл, раздел «Документация»: «этот файл —
// индекс правил, не энциклопедия: потолок 400 строк, подробности — в docs/»).
// Без счётчика правило само по себе не держится (M10 аудита 2026-09-12) —
// файл дорос до 404 строк, пока гейта не было.
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const FILE = join(ROOT, 'CLAUDE.md');
const LIMIT = 400;

function countLines(path) {
  const txt = readFileSync(path, 'utf8');
  if (txt === '') return 0;
  const n = txt.split('\n').length;
  return txt.endsWith('\n') ? n - 1 : n;
}

const lines = countLines(FILE);
if (lines > LIMIT) {
  console.error(
    `❌ CLAUDE.md: ${lines} строк, потолок ${LIMIT}.\n` +
      'Файл — индекс правил, не энциклопедия: подробности выносятся в docs/, ' +
      'а здесь остаётся заголовок раздела и ссылка (см., как раздел «Приложение ' +
      'на телефоне и уведомления» вынесен в docs/PWA.md).',
  );
  process.exit(1);
}
console.log(`✓ CLAUDE.md: ${lines} строк (потолок ${LIMIT})`);
