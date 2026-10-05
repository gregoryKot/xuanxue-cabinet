#!/usr/bin/env node
// Гейт установки скилла `/collaborate` (ADR-0169). Скилл живёт в
// `.claude/skills/collaborate/`, а `.gitignore` исключает остальной `.claude/`
// (личные настройки). Достаточно вернуть строку `.claude/` в `.gitignore` или
// потерять исключение `!.claude/skills/` — и скилл молча выпадает из
// репозитория: у следующего агента он не появится, а CI останется зелёным.
// Поэтому проверяем не наличие файла на диске, а то, что git его отслеживает.
//
// Заодно держим то, что делает установленную копию рабочей: метка проекта и
// ревизия источника записаны, раздел «Installation» удалён (он нужен только
// при установке), формат issue на месте, в CLAUDE.md есть блок со ссылкой на
// скилл — без него агент не узнает, когда скилл вызывать.
//
// Разбор — чистая функция findWorkshopSkillProblems без обращения к fs и git:
// check-workshop-skill.test.mjs гоняет её на фикстурах.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const SKILL_DIR = '.claude/skills/collaborate';
const SKILL_PATH = `${SKILL_DIR}/SKILL.md`;
const FORMAT_PATH = `${SKILL_DIR}/workshop-issue-format.md`;
const CLAUDE_MD_PATH = 'CLAUDE.md';

const PROJECT_LABEL_LINE = 'Project label: project:cabinet';
// Ревизия Workshop, из которой взят файл: полный sha коммита.
const SOURCE_REVISION_LINE = /^Source revision: [0-9a-f]{40}$/m;
const INSTALLATION_HEADING = '## Installation';
const FORMAT_LINK = '(workshop-issue-format.md)';
const CLAUDE_MD_HEADING = '## Workshop collaboration';
const CLAUDE_MD_SKILL_LINK = `(${SKILL_PATH})`;

/** Проблемы установки скилла; пустой массив — всё в порядке. */
export function findWorkshopSkillProblems({ trackedPaths, skill, format, claudeMd }) {
  const problems = [];

  for (const path of [SKILL_PATH, FORMAT_PATH]) {
    if (!trackedPaths.includes(path)) {
      problems.push(`${path} не отслеживается git (проверь .gitignore)`);
    }
  }

  if (!skill.includes(PROJECT_LABEL_LINE)) {
    problems.push(
      `${SKILL_PATH}: нет строки «${PROJECT_LABEL_LINE}» (метка проекта не записана)`,
    );
  }
  if (!SOURCE_REVISION_LINE.test(skill)) {
    problems.push(
      `${SKILL_PATH}: нет строки «Source revision: <40 hex>» (ревизия источника)`,
    );
  }
  if (skill.includes(INSTALLATION_HEADING)) {
    problems.push(
      `${SKILL_PATH}: раздел «${INSTALLATION_HEADING}» нужно удалить из установленной копии`,
    );
  }
  if (!skill.includes(FORMAT_LINK)) {
    problems.push(`${SKILL_PATH}: нет ссылки ${FORMAT_LINK} на формат issue`);
  }

  if (format.trim() === '') {
    problems.push(`${FORMAT_PATH}: файл формата issue пуст или отсутствует`);
  }

  if (!claudeMd.includes(CLAUDE_MD_HEADING)) {
    problems.push(`${CLAUDE_MD_PATH}: нет заголовка «${CLAUDE_MD_HEADING}»`);
  }
  if (!claudeMd.includes(CLAUDE_MD_SKILL_LINK)) {
    problems.push(`${CLAUDE_MD_PATH}: нет ссылки ${CLAUDE_MD_SKILL_LINK} на скилл`);
  }

  return problems;
}

function readOrEmpty(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    // Отсутствующий файл — не падение гейта, а проблема в отчёте.
    return '';
  }
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
  const res = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (res.status !== 0) {
    console.error('❌ git ls-files не отработал:\n' + (res.stderr || ''));
    process.exit(1);
  }

  const problems = findWorkshopSkillProblems({
    trackedPaths: res.stdout.split('\n').filter(Boolean),
    skill: readOrEmpty(ROOT, SKILL_PATH),
    format: readOrEmpty(ROOT, FORMAT_PATH),
    claudeMd: readOrEmpty(ROOT, CLAUDE_MD_PATH),
  });

  if (problems.length > 0) {
    console.error(
      `❌ скилл /collaborate установлен неверно:\n   ${problems.join('\n   ')}`,
    );
    console.error(
      'Скилл лежит в .claude/skills/collaborate/ и должен попадать в git (ADR-0169):\n' +
        'не возвращай `.claude/` в .gitignore целиком, исключай `.claude/*` кроме `skills/`.',
    );
    process.exit(1);
  }
  console.log('✓ скилл /collaborate установлен и отслеживается git');
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из теста.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
