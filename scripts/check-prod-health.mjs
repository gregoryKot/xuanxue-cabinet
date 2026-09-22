#!/usr/bin/env node
// Проверка живого прода (RUNBOOK, раздел «Мониторинг»; аудит 2026-09-21,
// RUNBOOK §8.19): зависший без таймаута планировщик и откат Railway на
// старый образ (§8.14) сегодня ловит только человек, который сам догадался
// зайти на /api/health. Ядро ниже — чистые функции без сети (тестируются в
// check-prod-health.test.mjs), CLI внизу файла подключает их к реальному
// fetch и печатает алерт для человека/notify-telegram.mjs.
import { spawnSync } from 'node:child_process';

export const DEFAULT_HEALTH_URL = 'https://xuanxue.su/api/health';
const DEFAULT_MIN_AGE_MIN = 30;
// Растущая пауза между попытками — второй/третий тик переживает рестарт
// инстанса на раскатке (RUNBOOK §2), не будя человека на ровном месте.
const RETRY_PAUSES_MS = [0, 5000, 15000];
const ATTEMPT_TIMEOUT_MS = 10_000;

/**
 * Проблема со сверкой commit — или `null`, если сверять нечего/не с чем.
 * `allowedShas` — список полных SHA, любой из которых на проде допустим
 * (пустой список — сверку не делаем: сравнивать не с чем). `deployedCommit` —
 * короткий SHA из ответа `/api/health` (health-commit.ts, 7 символов),
 * поэтому сверяем «один из allowedShas начинается с него», не равенство.
 * `codeAgeMin` — необязательная минутная давность последнего коммита,
 * менявшего код (для текста алерта, RUNBOOK §8.14) — если не передан,
 * просто не упоминается.
 */
export function deployedCommitProblem({ deployedCommit, allowedShas, codeAgeMin }) {
  if (!allowedShas || allowedShas.length === 0) return null;
  const hasMatch =
    typeof deployedCommit === 'string' &&
    deployedCommit.length > 0 &&
    allowedShas.some((sha) => sha.startsWith(deployedCommit));
  if (hasMatch) return null;
  const age =
    typeof codeAgeMin === 'number'
      ? ` — код смержен ${codeAgeMin} мин назад, ещё не на проде`
      : '';
  return `на проде commit "${deployedCommit ?? 'нет'}" — не входит в коммиты после последнего изменения кода${age} (RUNBOOK §8.14)`;
}

/**
 * Список проблем на русском по ответу `/api/health`. Пустой массив — всё
 * хорошо. Сверку commit делает deployedCommitProblem — см. её комментарий.
 */
export function healthProblems({ status, body, allowedShas, codeAgeMin }) {
  const problems = [];
  if (status !== 200) {
    problems.push(`код ответа ${status}, ожидали 200`);
  }
  const responseStatus = body?.status;
  if (responseStatus !== 'ok') {
    problems.push(`status: "${responseStatus ?? 'нет ответа'}", ожидали "ok"`);
  }
  const mongo = body?.mongo;
  if (mongo !== 'up') {
    problems.push(`mongo: "${mongo ?? 'нет ответа'}", ожидали "up"`);
  }
  if (body?.scheduler?.stale === true) {
    problems.push('планировщик завис: scheduler.stale === true (RUNBOOK §8.19)');
  }
  const commitProblem = deployedCommitProblem({
    deployedCommit: body?.commit,
    allowedShas,
    codeAgeMin,
  });
  if (commitProblem) problems.push(commitProblem);
  return problems;
}

/**
 * Сравнивать `commit` только если последний коммит, менявший код, старше
 * `minAgeMin` минут — иначе только что смерженный PR ещё не доехал до
 * Railway (RUNBOOK §2), и алерт был бы ложным. Секунды эпохи — числа, без
 * `new Date(строка)`.
 */
export function shouldCompareCommit({
  headCommittedAtSec,
  nowSec,
  minAgeMin = DEFAULT_MIN_AGE_MIN,
}) {
  return nowSec - headCommittedAtSec > minAgeMin * 60;
}

/** Текст алерта для Telegram — plain text, без markdown-разметки: свободный
 * список проблем не должен ломаться об экранирование (notify-telegram.mjs
 * шлёт его без `parse_mode`). */
export function alertMessage({ url, problems, runUrl }) {
  const lines = [
    `Прод не отвечает исправно: ${url}`,
    '',
    ...problems.map((p) => `- ${p}`),
  ];
  if (runUrl) lines.push('', `Прогон: ${runUrl}`);
  return lines.join('\n');
}

async function attemptOnce(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (err) {
    return {
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * До `attempts` попыток дозвониться до `url`, с паузами RETRY_PAUSES_MS —
 * перезапуск инстанса на раскатке не должен будить человека. Первый ответ с
 * кодом 200 возвращается сразу; иначе отдаётся результат последней попытки.
 * `sleep` инжектируется, чтобы тест не ждал реальные секунды.
 */
export async function probeHealth({ url, fetchImpl, sleep, attempts = 3 }) {
  let last = { status: 0, body: null, error: 'ни одной попытки' };
  for (let i = 0; i < attempts; i += 1) {
    const pause = RETRY_PAUSES_MS[i] ?? 0;
    if (pause > 0) await sleep(pause);
    last = await attemptOnce(url, fetchImpl);
    if (last.status === 200) return last;
  }
  return last;
}

// ---------------------------------------------------------------- CLI ----
// Ниже — подключение чистого ядра к реальной сети/git/процессу. Само по
// себе не тестируется юнитами (тот же приём, что у обёрток над spawnSync в
// scripts/git-refs.mjs): поведение проверяется прогоном workflow.

// Пути, изменение которых пересобирает Docker-образ (RUNBOOK §8.14: Railway
// c Watch Paths пропускает сборку коммита, который их не тронул — «прод
// отстал» здесь значит «отстал от последнего коммита в ЭТИХ путях», а не от
// HEAD целиком, иначе docs-only мерж каждые 6 часов алертил бы зря).
const CODE_PATHS = [
  'api',
  'web',
  'shared',
  'package.json',
  'package-lock.json',
  'Dockerfile',
];

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function committedAtSec(commit) {
  const stdout = runGit(['log', '-1', '--format=%ct', commit]);
  const parsed = stdout === null ? NaN : Number.parseInt(stdout, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Последний коммит (от HEAD назад), менявший CODE_PATHS — `null`, если git
 * не смог ответить (мелкий fetch-depth, например) или такого коммита нет. */
function lastCodeCommit() {
  return runGit(['rev-list', '-1', 'HEAD', '--', ...CODE_PATHS]);
}

/** codeSha и каждый коммит после него до HEAD — все они по определению не
 * трогали CODE_PATHS (иначе codeSha был бы не последним), поэтому прод на
 * любом из них — не расхождение. */
function allowedShasSince(codeSha) {
  const rest = runGit(['rev-list', `${codeSha}..HEAD`]);
  const later = rest ? rest.split('\n').filter(Boolean) : [];
  return [codeSha, ...later];
}

/** `{ allowedShas, codeAgeMin }` для сверки commit — оба пустые/undefined,
 * если сверка выключена (`CHECK_COMMIT` не задан), история недоступна
 * (мелкий чекаут) или код смержен недавно (шанс не доехать ещё есть). */
function resolveCommitCheck() {
  const skip = { allowedShas: [], codeAgeMin: undefined };
  if (!process.env.CHECK_COMMIT) return skip;

  const codeSha = lastCodeCommit();
  if (!codeSha) return skip; // истории нет или код никогда не менялся — тихо пропускаем

  const committedAt = committedAtSec(codeSha);
  if (committedAt === null)
    return { allowedShas: allowedShasSince(codeSha), codeAgeMin: undefined };

  const nowSec = Math.floor(Date.now() / 1000);
  if (!shouldCompareCommit({ headCommittedAtSec: committedAt, nowSec })) return skip;

  return {
    allowedShas: allowedShasSince(codeSha),
    codeAgeMin: Math.floor((nowSec - committedAt) / 60),
  };
}

async function main() {
  const url = process.env.HEALTH_URL?.trim() || DEFAULT_HEALTH_URL;
  console.log(`Проверяем ${url}`);

  const result = await probeHealth({
    url,
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  // stdout (не stderr) — эта строка идёт в health-output.txt, который
  // читает шаг алерта в Telegram: сетевую ошибку при код 0 человек должен
  // увидеть в сообщении, а не только в логе шага.
  console.log(
    `Ответ: код ${result.status}` +
      (result.error ? `, ошибка сети: ${result.error}` : ''),
  );

  const { allowedShas, codeAgeMin } = resolveCommitCheck();
  const problems = healthProblems({
    status: result.status,
    body: result.body,
    allowedShas,
    codeAgeMin,
  });

  if (problems.length === 0) {
    console.log('✓ прод отвечает исправно');
    return;
  }

  for (const problem of problems) console.error(`❌ ${problem}`);
  console.log(alertMessage({ url, problems }));
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(
      `❌ check-prod-health: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
