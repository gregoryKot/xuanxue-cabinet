// Набор запрещённых конструкций (robot-phrases-patterns.mjs) на строках-фикстурах,
// не на реальном дереве: гейт видит только счётчики, а промах регулярки
// выглядит как «стало лучше».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS } from './robot-phrases-patterns.mjs';

// `matchAll` клонирует регулярку: общий `lastIndex` у выражений с флагом `g`
// не протекает между проверками.
function findAll(name, text) {
  const entry = PATTERNS.find(([patternName]) => patternName === name);
  assert.ok(entry, `нет паттерна ${name}`);
  return [...text.matchAll(entry[1])].map((match) => match[0]);
}

const ADMIN_ROLE_FORMS = [
  'администратор',
  'администратора',
  'администратору',
  'администратором',
  'администраторе',
  'администраторы',
  'администраторов',
  'администраторам',
  'администраторами',
  'администраторах',
];

test('admin-role-word: все десять форм слова — находки', () => {
  for (const form of ADMIN_ROLE_FORMS) {
    assert.deepEqual(findAll('admin-role-word', `Видит только ${form} — не больше.`), [
      form,
    ]);
  }
});

test('admin-role-word: слово с заглавной буквы — находка', () => {
  assert.deepEqual(findAll('admin-role-word', 'Администратор назначает роли.'), [
    'Администратор',
  ]);
  assert.deepEqual(findAll('admin-role-word', 'Администраторам доступно всё.'), [
    'Администраторам',
  ]);
});

test('admin-role-word: «администратор школы» — человек для обращения, не находка', () => {
  assert.deepEqual(findAll('admin-role-word', 'Обратитесь к администратору школы.'), []);
  assert.deepEqual(
    findAll('admin-role-word', 'Администратор школы объединит записи.'),
    [],
  );
});

test('admin-role-word: чужое слово с тем же корнем — не находка', () => {
  assert.deepEqual(findAll('admin-role-word', 'суперадминистратор'), []);
  assert.deepEqual(findAll('admin-role-word', 'администраторский доступ'), []);
});

test('admin-role-word: «школы» только после администратора — иначе находка', () => {
  assert.deepEqual(findAll('admin-role-word', 'Школы видит администратор.'), [
    'администратор',
  ]);
});

test('bank-word: «банк вопросов» — находка, «банкомат» и «банков» — нет', () => {
  assert.deepEqual(findAll('bank-word', 'Добавьте в банк вопросов.'), ['банк']);
  assert.deepEqual(findAll('bank-word', 'Рядом банкомат, а не список банков.'), []);
});

test('набор — пары [имя, регулярка с флагом g], имена не повторяются', () => {
  const names = PATTERNS.map(([name]) => name);
  assert.equal(new Set(names).size, names.length);
  for (const [name, re] of PATTERNS) {
    assert.equal(typeof name, 'string');
    assert.ok(re instanceof RegExp && re.global, `${name}: регулярка без флага g`);
  }
});
