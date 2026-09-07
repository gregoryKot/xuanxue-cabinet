// Проверка и подготовка PATCH /settings.templates — чистая логика, юнит-тест
// без Mongo (CLAUDE.md «Тесты»). Allow-list плейсхолдеров общий с рендером
// (findUnknownPlaceholders, shared/src/templates.ts, ADR-0011) — форма не
// должна тихо потерять опечатку в `{имя}`.
import {
  TEMPLATE_PLACEHOLDERS,
  findUnknownPlaceholders,
  type TemplateKind,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

const AVAILABLE = TEMPLATE_PLACEHOLDERS.map((name) => `{${name}}`).join(', ');

/** Каждый переданный шаблон — только известные плейсхолдеры, иначе 400 с
 * именем шаблона и перечнем (docs/PLAN.md §6): учитель правит оба шаблона
 * одной формой, и без имени поля неясно, в lesson_link опечатка или в
 * recording. */
export function assertKnownPlaceholders(
  templates: Partial<Record<TemplateKind, string>>,
): void {
  for (const [kind, text] of Object.entries(templates) as [
    TemplateKind,
    string | undefined,
  ][]) {
    if (text === undefined) continue;
    const unknown = findUnknownPlaceholders(text);
    if (unknown.length === 0) continue;
    throw new InvalidInputError(
      `В шаблоне «${kind}» неизвестные подстановки: ${unknown
        .map((name) => `{${name}}`)
        .join(', ')}. Доступные: ${AVAILABLE}.`,
    );
  }
}

/** `$set` для findOneAndUpdate — только переданные шаблоны; ключи схемы
 * (lessonLink) отличаются от ключей API (lesson_link), см. settings.schema.ts. */
export function templatesSetFrom(
  templates: Partial<Record<TemplateKind, string>>,
): Record<string, string> {
  const $set: Record<string, string> = {};
  if (templates.lesson_link !== undefined) {
    $set['templates.lessonLink'] = templates.lesson_link;
  }
  if (templates.recording !== undefined) {
    $set['templates.recording'] = templates.recording;
  }
  return $set;
}
