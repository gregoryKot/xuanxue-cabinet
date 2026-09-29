#!/usr/bin/env node
// Выкат main → release (ADR-0142, ADR-0144): прод раскатывает не каждый
// мерж и не сам по расписанию, а коммит main по ручной команде владельца —
// тот, что отстоялся на стейджинге SOAK_HOURS и прошёл CI. Ядро ниже —
// чистые функции без сети/git (тестируются в release-candidate.test.mjs),
// CLI внизу подключает их к реальному git, GitHub REST и /api/health
// (.github/workflows/release.yml).
import { healthProblems } from './check-prod-health.mjs';

export const DEFAULT_SOAK_HOURS = 2;
export const DEFAULT_STAGING_HEALTH_URL = 'https://staging.xuanxue.su/api/health';
export const DEFAULT_PROD_HEALTH_URL = 'https://xuanxue.su/api/health';
const SECONDS_PER_HOUR = 3600;
const MAX_SUMMARY_COMMITS = 15;

/**
 * Коммит-кандидат в прод: самый новый коммит из `commits` (newest first),
 * который отлежался `soakHours` часов и прошёл CI зелёным. Коммит старше
 * порога с красным CI не заваливает выкат целиком — пропускаем его и ищем
 * дальше в глубину (`cancelled` — с ADR-0154 CI на main не отменяется сам,
 * значит, это ручная отмена: вердикта нет, такой коммит пропускаем так же).
 * `soakHours: 0` — хотфикс-режим, срок отстоя не требуется.
 */
export function pickCandidate({ commits, nowSec, soakHours = DEFAULT_SOAK_HOURS }) {
  if (!commits || commits.length === 0) {
    return { sha: null, reason: 'в main нет нового после прошлого выката' };
  }

  const soakSec = soakHours * SECONDS_PER_HOUR;
  let sawFreshEnough = false;
  for (const commit of commits) {
    const ageSec = nowSec - commit.committedAtSec;
    if (ageSec < soakSec) continue; // ещё не отлежался — смотрим дальше в прошлое
    sawFreshEnough = true;
    if (commit.ci === 'success') return { sha: commit.sha, reason: null };
    // failure/cancelled/pending/none — этот коммит не годится, идём глубже.
  }

  if (!sawFreshEnough) {
    return { sha: null, reason: `все коммиты main новее ${soakHours} ч — ждём отстоя` };
  }
  return {
    sha: null,
    reason: 'ни один отстоявшийся коммит main не прошёл CI зелёным',
  };
}

/**
 * Проблема со стейджингом перед выкатом на прод — или `null`, если всё
 * хорошо. Переиспользует healthProblems (без сверки commit — она своя: нам
 * важно, что стейджинг стоит НЕ СТАРШЕ кандидата, а не на конкретном SHA).
 */
export function stagingProblem({
  stagingBody,
  stagingStatus,
  candidateIsAncestorOfStaging,
}) {
  const problems = healthProblems({ status: stagingStatus, body: stagingBody });
  if (problems.length > 0) {
    return `стейджинг нездоров: ${problems.join('; ')}`;
  }
  if (!candidateIsAncestorOfStaging) {
    return 'кандидат ещё не доехал до стейджинга — выкат подождёт';
  }
  return null;
}

/** Тег вида `prod-YYYYMMDD-HHMM`, час и минута — UTC (не пояс раннера). */
export function releaseTagName(nowSec) {
  const d = new Date(nowSec * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  return `prod-${y}${m}${day}-${hh}${mm}`;
}

/**
 * Тег перед самым новым `prod-*` тегом — дефолтная цель отката. `tags` —
 * произвольный порядок; сортируем по имени (формат YYYYMMDD-HHMM сортируется
 * лексикографически так же, как по времени). `currentSha` — если задан,
 * тег с этим SHA исключается (не откатываемся «на себя же»).
 */
export function previousReleaseTag(tags, currentSha) {
  const prodTags = (tags || [])
    .filter((t) => /^prod-\d{8}-\d{4}$/.test(t.name))
    .filter((t) => !currentSha || t.sha !== currentSha)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (prodTags.length < 2) return null; // меньше двух тегов — предыдущего нет
  return prodTags[prodTags.length - 2].name;
}

/**
 * Прод ещё не докатился до цели выката — Русский текст проблемы, иначе
 * `null`. Переиспользует healthProblems (без сверки commit — своя логика:
 * короткий SHA из /api/health сравнивается с полным `targetSha` по
 * префиксу, как в deployedCommitProblem).
 */
export function targetReachedProblem({ status, body, targetSha }) {
  const problems = healthProblems({ status, body });
  if (problems.length > 0) return problems.join('; ');
  const deployed = body?.commit;
  const matches =
    typeof deployed === 'string' &&
    deployed.length > 0 &&
    (targetSha.startsWith(deployed) ||
      deployed.startsWith(targetSha.slice(0, deployed.length)));
  if (!matches) {
    return `на проде commit "${deployed ?? 'нет'}" — ждём "${targetSha.slice(0, 7)}"`;
  }
  return null;
}

/** Текст уведомления в Telegram — plain text (notify-telegram.mjs шлёт без
 * parse_mode, см. его комментарий). */
export function summaryMessage({ mode, sha, subjectLines, tag }) {
  const shortSha = sha ? sha.slice(0, 7) : '—';
  const header =
    mode === 'rollback'
      ? `Откат прода на ${shortSha} (тег ${tag})`
      : `Прод обновлён до ${shortSha} (тег ${tag})`;
  const lines = [header, ''];
  const subjects = subjectLines || [];
  if (subjects.length === 0) {
    lines.push('Список коммитов недоступен.');
  } else {
    const shown = subjects.slice(0, MAX_SUMMARY_COMMITS);
    lines.push(...shown.map((s) => `- ${s}`));
    const rest = subjects.length - shown.length;
    if (rest > 0) lines.push(`и ещё ${rest}`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------- CLI-диспетчер ----
// Сама сеть/git — в release-pick.mjs (`pick`), release-wait.mjs (`wait`) и
// release-ops.mjs (остальное): этот файл не разросся бы за потолок нового
// файла, держи ядро и CLI раздельно (CLAUDE.md, «Храповики»,
// check-file-size-ratchet.mjs).
const SUBCOMMAND_MODULES = {
  pick: ['./release-pick.mjs', 'runPick'],
  wait: ['./release-wait.mjs', 'runWait'],
  'tag-name': ['./release-ops.mjs', 'runTagName'],
  'rollback-target': ['./release-ops.mjs', 'runRollbackTarget'],
  summary: ['./release-ops.mjs', 'runSummary'],
};

async function main() {
  const [, , subcommand] = process.argv;
  const entry = SUBCOMMAND_MODULES[subcommand];
  if (!entry) {
    console.error(
      `Использование: node scripts/release-candidate.mjs ${Object.keys(SUBCOMMAND_MODULES).join('|')}`,
    );
    process.exitCode = 1;
    return;
  }
  const [modulePath, exportName] = entry;
  const mod = await import(modulePath);
  await mod[exportName]();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(
      `❌ release-candidate: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
