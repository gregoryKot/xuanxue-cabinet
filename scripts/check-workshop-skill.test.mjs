// Тест на разбор check-workshop-skill.mjs (ADR-0169): фикстуры, не реальное
// дерево репозитория — иначе проверялось бы только сегодняшнее состояние.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWorkshopSkillProblems } from './check-workshop-skill.mjs';

const SKILL_PATH = '.claude/skills/collaborate/SKILL.md';
const FORMAT_PATH = '.claude/skills/collaborate/workshop-issue-format.md';
const REVISION = 'e209d27239391be3af2be71b898c79f453851c01';

const GOOD_SKILL = [
  'Project label: project:cabinet',
  `Source revision: ${REVISION}`,
  'following [the issue format](workshop-issue-format.md).',
  '## Check addressed work',
].join('\n');
const GOOD_CLAUDE_MD =
  '## Workshop collaboration\n\nUse the [/collaborate skill](.claude/skills/collaborate/SKILL.md) ...';

function good(overrides = {}) {
  return {
    trackedPaths: [SKILL_PATH, FORMAT_PATH, 'CLAUDE.md'],
    skill: GOOD_SKILL,
    format: '# Workshop issue format\n',
    claudeMd: GOOD_CLAUDE_MD,
    ...overrides,
  };
}

test('всё в порядке — проблем нет', () => {
  assert.deepEqual(findWorkshopSkillProblems(good()), []);
});

test('файл скилла не отслеживается git — проблема называет .gitignore', () => {
  const problems = findWorkshopSkillProblems(good({ trackedPaths: [FORMAT_PATH] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SKILL\.md не отслеживается git \(проверь \.gitignore\)/);
});

test('файл формата не отслеживается git', () => {
  const problems = findWorkshopSkillProblems(good({ trackedPaths: [SKILL_PATH] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /workshop-issue-format\.md не отслеживается git/);
});

test('placeholder метки остался — метка проекта не записана', () => {
  const skill = GOOD_SKILL.replace(
    'Project label: project:cabinet',
    'Project label: <set from your installation issue>',
  );
  const problems = findWorkshopSkillProblems(good({ skill }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Project label: project:cabinet/);
});

test('раздел Installation не удалён', () => {
  const skill = `${GOOD_SKILL}\n## Installation\n1. Read your issue.`;
  const problems = findWorkshopSkillProblems(good({ skill }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## Installation/);
});

test('нет ревизии источника или она короче 40 символов', () => {
  const none = GOOD_SKILL.replace(`Source revision: ${REVISION}\n`, '');
  assert.equal(findWorkshopSkillProblems(good({ skill: none })).length, 1);
  const short = GOOD_SKILL.replace(REVISION, 'e209d27');
  const problems = findWorkshopSkillProblems(good({ skill: short }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Source revision/);
});

test('нет ссылки на формат issue в скилле', () => {
  const skill = GOOD_SKILL.replace('(workshop-issue-format.md)', '');
  const problems = findWorkshopSkillProblems(good({ skill }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /\(workshop-issue-format\.md\)/);
});

test('файл формата пуст', () => {
  const problems = findWorkshopSkillProblems(good({ format: '  \n' }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /пуст или отсутствует/);
});

test('в CLAUDE.md нет ссылки на скилл', () => {
  const problems = findWorkshopSkillProblems(
    good({ claudeMd: '## Workshop collaboration\n\nбез ссылки' }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ссылки \(\.claude\/skills\/collaborate\/SKILL\.md\)/);
});

test('в CLAUDE.md нет заголовка блока', () => {
  const problems = findWorkshopSkillProblems(
    good({ claudeMd: '[/collaborate skill](.claude/skills/collaborate/SKILL.md)' }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## Workshop collaboration/);
});
