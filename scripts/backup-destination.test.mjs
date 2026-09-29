// Тест backup-destination.mjs (ADR-0152): решение «R2 или артефакт», тексты
// напоминания и — главное — сверка самого backup.yml с этим решением. Ошибка,
// из-за которой файл появился: бэкап ушёл в артефакт публичного репозитория, и
// ни один гейт этого не заметил (ADR-0017 писался для приватного репозитория).
// Теперь возврат в артефакт без R2 может случиться только громко, а артефакт при
// настроенном R2 не создаётся вовсе. Без сети и без Mongo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  R2_SECRET_NAMES,
  BACKUP_KEY_PREFIX,
  missingR2Secrets,
  chooseDestination,
  backupObjectKey,
  githubOutputLines,
  parseMissing,
  escapeWorkflowCommand,
  fallbackWarning,
  fallbackNotice,
} from './backup-destination.mjs';

const SCRIPT = join(import.meta.dirname, 'backup-destination.mjs');
const WORKFLOW = join(import.meta.dirname, '..', '.github', 'workflows', 'backup.yml');
const BACKUP_FILE = 'backups/backup-20260929T031700Z.archive.gz.enc';

function fullEnv() {
  return Object.fromEntries(R2_SECRET_NAMES.map((name) => [name, `значение-${name}`]));
}

// --- решение ---------------------------------------------------------------

test('четыре секрета заданы — R2, запасного пути нет', () => {
  assert.deepEqual(chooseDestination(fullEnv()), { target: 'r2', missing: [] });
});

for (const name of R2_SECRET_NAMES) {
  test(`нет ${name} — запасной путь, и именно он назван в missing`, () => {
    const env = { ...fullEnv(), [name]: '' };
    assert.deepEqual(chooseDestination(env), { target: 'artifact', missing: [name] });
  });
}

test('секретов нет вовсе (release.yml без них, первая ночь) — артефакт, не падение', () => {
  assert.deepEqual(chooseDestination({}), {
    target: 'artifact',
    missing: R2_SECRET_NAMES,
  });
});

test('секрет из одних пробелов и переводов строки считается пустым', () => {
  const env = { ...fullEnv(), BACKUP_R2_BUCKET: ' \n\t ' };
  assert.deepEqual(missingR2Secrets(env), ['BACKUP_R2_BUCKET']);
  assert.equal(chooseDestination(env).target, 'artifact');
});

test('лишние переменные окружения решение не меняют', () => {
  const env = { ...fullEnv(), PATH: '/usr/bin', BACKUP_PASSPHRASE: 'x' };
  assert.equal(chooseDestination(env).target, 'r2');
});

// --- ключ и вывод шага -------------------------------------------------------

test('backupObjectKey: имя файла под префиксом, каталоги пути отбрасываются', () => {
  const expected = `${BACKUP_KEY_PREFIX}backup-20260929T031700Z.archive.gz.enc`;
  assert.equal(backupObjectKey(BACKUP_FILE), expected);
  assert.equal(backupObjectKey(`/home/runner/work/x/x/${BACKUP_FILE}`), expected);
});

test('backupObjectKey: пустой путь — ошибка, а не ключ «mongo/»', () => {
  assert.throws(() => backupObjectKey(''), /не указан файл/);
  assert.throws(() => backupObjectKey(undefined), /не указан файл/);
});

test('githubOutputLines и parseMissing: список имён переживает круг через вывод шага', () => {
  const missing = ['BACKUP_R2_ENDPOINT', 'BACKUP_R2_BUCKET'];
  const lines = githubOutputLines({ target: 'artifact', missing, key: 'mongo/a.enc' });
  assert.equal(
    lines,
    'target=artifact\nkey=mongo/a.enc\nmissing=BACKUP_R2_ENDPOINT,BACKUP_R2_BUCKET\n',
  );
  assert.deepEqual(parseMissing('BACKUP_R2_ENDPOINT,BACKUP_R2_BUCKET'), missing);
  assert.deepEqual(parseMissing(''), []);
  assert.deepEqual(parseMissing(undefined), []);
});

// --- тексты ------------------------------------------------------------------

test('escapeWorkflowCommand: %, CR и LF не ломают аннотацию', () => {
  assert.equal(escapeWorkflowCommand('100%\r\nдва'), '100%25%0D%0Aдва');
});

test('fallbackWarning: одна строка-аннотация с именами секретов и ссылкой на RUNBOOK', () => {
  const warning = fallbackWarning({ missing: ['BACKUP_R2_BUCKET'] });
  assert.match(warning, /^::warning title=[^:,\n]+::/);
  assert.doesNotMatch(warning, /\n/);
  assert.match(warning, /BACKUP_R2_BUCKET/);
  assert.match(warning, /артефакт публичного репозитория/);
  assert.match(warning, /RUNBOOK\.md, раздел 7\.1/);
});

test('fallbackNotice: простым русским — где лежит бэкап, чего не хватает, что делать', () => {
  const runUrl = 'https://github.com/o/r/actions/runs/1';
  const text = fallbackNotice({ missing: ['BACKUP_R2_ENDPOINT'], runUrl });
  assert.match(text, /артефакте Actions публичного репозитория/);
  assert.match(text, /R2 для бэкапов ещё не настроено/);
  assert.match(text, /Не задано: BACKUP_R2_ENDPOINT\./);
  assert.match(text, /docs\/RUNBOOK\.md, раздел 7\.1/);
  assert.match(text, /каждую ночь/);
  assert.match(text, new RegExp(`Прогон: ${runUrl}`));
  // Telegram получает простой текст: звёздочки акцента дошли бы как есть.
  assert.doesNotMatch(text, /\*\*/);
});

test('fallbackNotice: без ссылки на прогон строки «Прогон» нет', () => {
  assert.doesNotMatch(fallbackNotice({ missing: [] }), /Прогон/);
});

test('тексты не содержат значений секретов — только имена', () => {
  const env = fullEnv();
  delete env.BACKUP_R2_BUCKET;
  const { missing } = chooseDestination(env);
  const printed = [fallbackWarning({ missing }), fallbackNotice({ missing })].join('\n');
  for (const value of Object.values(env)) assert.ok(!printed.includes(value));
});

// --- CLI: то, что реально вызывает workflow ------------------------------------

function runCli(args, extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'backup-destination-'));
  const outputFile = join(dir, 'github-output');
  try {
    // Окружение собрано с нуля: настоящие BACKUP_R2_* с машины разработчика
    // не должны менять исход теста.
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputFile, ...extraEnv },
      encoding: 'utf8',
    });
    let output = '';
    try {
      output = readFileSync(outputFile, 'utf8');
    } catch {
      // Режим без записи в $GITHUB_OUTPUT — файла нет, и это нормально.
    }
    return { ...result, output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI plan: все секреты — target=r2 и ключ в вывод шага', () => {
  const result = runCli(['plan', BACKUP_FILE], fullEnv());
  assert.equal(result.status, 0);
  assert.match(result.output, /^target=r2$/m);
  assert.match(result.output, /^key=mongo\/backup-20260929T031700Z\.archive\.gz\.enc$/m);
  assert.match(result.output, /^missing=$/m);
  assert.doesNotMatch(result.stdout, /значение-/);
});

test('CLI plan: секретов нет — target=artifact, код 0 (бэкап не должен падать)', () => {
  const result = runCli(['plan', BACKUP_FILE], {});
  assert.equal(result.status, 0);
  assert.match(result.output, /^target=artifact$/m);
  assert.match(result.output, /^missing=BACKUP_R2_ENDPOINT,BACKUP_R2_BUCKET,/m);
});

test('CLI plan: без пути к файлу — ненулевой код', () => {
  const result = runCli(['plan'], fullEnv());
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /не указан файл/);
});

test('CLI warning и notice: читают missing и RUN_URL из окружения шага', () => {
  const env = {
    BACKUP_R2_MISSING: 'BACKUP_R2_BUCKET',
    RUN_URL: 'https://example.test/run/7',
  };
  const warning = runCli(['warning'], env);
  assert.equal(warning.status, 0);
  assert.match(warning.stdout, /^::warning title=/);
  assert.match(warning.stdout, /BACKUP_R2_BUCKET/);
  const notice = runCli(['notice'], env);
  assert.equal(notice.status, 0);
  assert.match(notice.stdout, /Не задано: BACKUP_R2_BUCKET\./);
  assert.match(notice.stdout, /Прогон: https:\/\/example\.test\/run\/7/);
});

test('CLI: неизвестный режим — ненулевой код и подсказка', () => {
  const result = runCli(['upload'], {});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Использование/);
});

// --- сверка backup.yml с решением ----------------------------------------------

// Шаги workflow как куски текста; комментарии вычищены, иначе слова из
// пояснений («aws s3 cp», «artifact») склеились бы с соседним шагом.
function workflowSteps() {
  const text = readFileSync(WORKFLOW, 'utf8').replace(/^\s*#.*$/gm, '');
  return text
    .slice(text.indexOf('\n    steps:\n'))
    .split(/^ {6}- /m)
    .slice(1);
}

const IF_R2 = "if: steps.destination.outputs.target == 'r2'";
const IF_ARTIFACT = "if: steps.destination.outputs.target == 'artifact'";

test('backup.yml: артефакт создаётся одним шагом и только когда target=artifact', () => {
  const steps = workflowSteps().filter((step) =>
    step.includes('actions/upload-artifact'),
  );
  assert.equal(steps.length, 1);
  assert.ok(
    steps[0].includes(IF_ARTIFACT),
    'у шага с артефактом нет условия target == artifact',
  );
});

test('backup.yml: в R2 грузит один шаг aws s3 cp и только когда target=r2', () => {
  const steps = workflowSteps().filter((step) => step.includes('aws s3 cp'));
  assert.equal(steps.length, 1);
  assert.ok(steps[0].includes(IF_R2), 'у шага с загрузкой в R2 нет условия target == r2');
  assert.ok(
    steps[0].includes('--endpoint-url'),
    'без --endpoint-url aws уйдёт в настоящий S3',
  );
  assert.match(steps[0], /AWS_DEFAULT_REGION: auto/);
});

test('backup.yml: решение и загрузка получают все секреты R2 из secrets', () => {
  const steps = workflowSteps();
  const destination = steps.find((step) => step.includes('id: destination'));
  const upload = steps.find((step) => step.includes('aws s3 cp'));
  assert.ok(destination && upload);
  // Секрет, не дошедший до шага решения, читался бы пустым: бэкап молча ушёл
  // бы в публичный артефакт, даже когда владелец всё настроил.
  for (const name of R2_SECRET_NAMES) {
    assert.ok(
      destination.includes(`${name}: \${{ secrets.${name} }}`),
      `решение не видит ${name}`,
    );
  }
  assert.ok(destination.includes('backup-destination.mjs plan'));
  for (const name of R2_SECRET_NAMES) {
    assert.ok(upload.includes(`secrets.${name}`), `загрузка не видит ${name}`);
  }
});

test('backup.yml: напоминание идёт только с артефактом и шлёт warning и Telegram', () => {
  const reminder = workflowSteps().find((step) =>
    step.includes('backup-destination.mjs warning'),
  );
  assert.ok(reminder, 'нет шага с напоминанием');
  assert.ok(reminder.includes(IF_ARTIFACT));
  assert.ok(
    reminder.includes('backup-destination.mjs notice | node scripts/notify-telegram.mjs'),
  );
  assert.ok(
    reminder.includes('shell: bash'),
    'без bash нет pipefail — падение notice потерялось бы',
  );
});

test('артефакты в репозитории публикуют только ci.yml (покрытие) и запасной путь backup.yml', () => {
  // Репозиторий публичный: любой артефакт скачивает каждый вошедший в GitHub
  // (ADR-0152). Новый workflow с upload-artifact — повод остановиться и решить
  // здесь, что в нём лежит, а не обнаружить это по чужим скачиваниям.
  const dir = join(import.meta.dirname, '..', '.github', 'workflows');
  const publishers = readdirSync(dir)
    .filter((file) => file.endsWith('.yml'))
    .filter((file) =>
      readFileSync(join(dir, file), 'utf8').includes('actions/upload-artifact'),
    );
  assert.deepEqual(publishers.sort(), ['backup.yml', 'ci.yml']);
});

test('backup.yml: секреты R2 объявлены в workflow_call как необязательные', () => {
  const text = readFileSync(WORKFLOW, 'utf8');
  for (const name of R2_SECRET_NAMES) {
    // required: true уронил бы release.yml (secrets: inherit) до настройки R2.
    assert.match(text, new RegExp(`^ {6}${name}:\\n {8}required: false$`, 'm'), name);
  }
});
