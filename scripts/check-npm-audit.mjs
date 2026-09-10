#!/usr/bin/env node
// Гейт уязвимостей prod-зависимостей вместо голого `npm audit --audit-level=high`
// (CLAUDE.md «Зависимости»). Голая команда умеет только «всё чисто» или «стоп»:
// когда у уязвимости нет исправленной версии — а так было с multer 2026-09-10,
// его жёстко тянет @nestjs/platform-express 11.x — красным становится каждый PR
// в репозитории, и единственный доступный ход, снять гейт совсем, теряет и все
// остальные предупреждения.
//
// Здесь исключение — осознанное и с сроком: запись в audit-allowlist.json
// называет уязвимость, причину и дату пересмотра. Гейт падает, если
// появилась уязвимость не из списка, если у записи истёк срок и если запись
// больше ни на что не указывает (уязвимость закрыта — исключение пора убрать,
// иначе список превращается в свалку). CLAUDE.md: правило без механизма
// принуждения не работает.
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = join(SCRIPTS_DIR, 'audit-allowlist.json');
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

/** `npm audit` возвращает ненулевой код, когда что-то нашёл, — это не сбой
 * запуска, отчёт всё равно в stdout. Настоящий сбой (нет сети, кривой JSON)
 * отличаем по отсутствию разбираемого вывода. */
function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.trim() !== '') return err.stdout;
    throw err;
  }
}

function readAllowlist() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('audit-allowlist.json должен быть массивом');
  return raw;
}

/** Плоский список уязвимостей уровня high и выше: у npm они разложены по
 * пакетам, а конкретные советы (GHSA) лежат в `via`, иногда ссылками на другой
 * пакет — такие строки пропускаем, сам совет придёт со своим пакетом. */
function blockingAdvisories(report) {
  const found = [];
  for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      if (typeof via === 'string') continue;
      if (!BLOCKING_SEVERITIES.has(via.severity)) continue;
      found.push({
        package: name,
        ghsa: ghsaFrom(via.url),
        title: via.title,
        severity: via.severity,
      });
    }
  }
  return found;
}

function ghsaFrom(url) {
  const match = /GHSA-[0-9a-z-]+/i.exec(url ?? '');
  return match ? match[0] : (url ?? 'без-ссылки');
}

function main() {
  const report = JSON.parse(runAudit());
  const advisories = blockingAdvisories(report);
  const allowlist = readAllowlist();
  const today = new Date().toISOString().slice(0, 10);

  const problems = [];
  const accepted = [];

  for (const advisory of advisories) {
    const allowed = allowlist.find((item) => item.ghsa === advisory.ghsa);
    if (!allowed) {
      problems.push(
        `новая уязвимость ${advisory.severity}: ${advisory.package} — ${advisory.title} (${advisory.ghsa})`,
      );
      continue;
    }
    if (allowed.expires < today) {
      problems.push(
        `срок исключения истёк ${allowed.expires}: ${advisory.package} ${advisory.ghsa} — пересмотрите, ` +
          `появилась ли исправленная версия`,
      );
      continue;
    }
    accepted.push(`${advisory.package} ${advisory.ghsa} (до ${allowed.expires})`);
  }

  const seen = new Set(advisories.map((advisory) => advisory.ghsa));
  for (const item of allowlist) {
    if (seen.has(item.ghsa)) continue;
    problems.push(
      `исключение ${item.ghsa} (${item.package}) больше не срабатывает — уязвимость закрыта, ` +
        `удалите запись из scripts/audit-allowlist.json`,
    );
  }

  if (problems.length > 0) {
    console.error('❌ npm audit (prod-зависимости, high и выше):');
    for (const problem of problems) console.error(`   ${problem}`);
    console.error('   Исключение с причиной и сроком — scripts/audit-allowlist.json.');
    process.exit(1);
  }

  const suffix = accepted.length > 0 ? `, принято с сроком: ${accepted.join('; ')}` : '';
  console.log(`✓ npm audit: новых уязвимостей high и выше нет${suffix}`);
}

main();
