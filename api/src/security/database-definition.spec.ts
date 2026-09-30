// Документ-определение базы (docs/DATABASE.md, правила защиты приватности 2017,
// п. 2) не должен отставать от системы. Правило 1д CLAUDE.md, задача #474: тот
// же класс ошибки, что нашёл ADR-0155 для страницы /privacy, — текст написан
// руками, и ничто не сверяет его с кодом. Здесь сверяются два списка, которые
// закон требует назвать и которые в коде уже есть: типы данных (коллекции) и
// подрядчики (PRIVACY_RECIPIENTS). Новая коллекция или новая служба без строки
// в документе — красный тест.
//
// Чего тест не видит: договоры, регионы, имена, число людей с доступом. Их
// держит только годовой пересмотр до 31 декабря (DATABASE.md §10).
import { readFileSync } from 'fs';
import { join } from 'path';
import { PRIVACY_RECIPIENTS, type PrivacyRecipientId } from '@xuanxue/shared';
import { MODEL_DEFINITIONS } from '../common/model.registry';

const DOC_PATH = join(__dirname, '..', '..', '..', 'docs', 'DATABASE.md');

// Как подрядчик называется в таблице договоров (DATABASE.md §5). Запись по
// каждому id из PRIVACY_RECIPIENTS: новый id без строки здесь не соберётся (tsc).
const CONTRACT_MARKER: Record<PrivacyRecipientId, string> = {
  railway: 'Railway',
  'mongodb-atlas': 'MongoDB Atlas',
  'cloudflare-r2': 'Cloudflare',
  resend: 'Resend',
  telegram: 'Telegram',
  google: 'Google (вход)',
  posthog: 'PostHog',
  'push-services': 'службы push',
  github: 'GitHub',
};

function section(doc: string, number: number): string {
  const start = doc.indexOf(`\n## ${number}. `);
  if (start === -1) throw new Error(`в DATABASE.md нет раздела ${number}`);
  const next = doc.indexOf('\n## ', start + 1);
  return doc.slice(start, next === -1 ? undefined : next);
}

describe('документ-определение базы (docs/DATABASE.md)', () => {
  const doc = readFileSync(DOC_PATH, 'utf8');

  it('каждая коллекция из MODEL_DEFINITIONS названа в разделе про данные', () => {
    const dataSection = section(doc, 3);
    const collections = MODEL_DEFINITIONS.map((def) => def.schema.get('collection'));

    const missing = collections.filter((name) => !dataSection.includes(`\`${name}\``));

    // Новая коллекция: добавьте строку в таблицу DATABASE.md §3 (что внутри, что
    // шифруется, срок) — или в перечень данных школы, если личных данных в ней нет.
    expect(collections).not.toContain(undefined);
    expect(missing).toEqual([]);
  });

  it('каждый подрядчик из PRIVACY_RECIPIENTS назван в таблице договоров', () => {
    const contractsSection = section(doc, 5);

    const missing = PRIVACY_RECIPIENTS.filter(
      ({ id }) => !contractsSection.includes(CONTRACT_MARKER[id]),
    ).map(({ id }) => id);

    // Новая служба: добавьте строку в DATABASE.md §5 (есть ли DPA, как принимается,
    // что делать владельцу) и в §4 (страна, какие данные доходят).
    expect(missing).toEqual([]);
  });
});
