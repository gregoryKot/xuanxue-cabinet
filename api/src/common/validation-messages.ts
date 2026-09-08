// Общий exceptionFactory ValidationPipe (app.setup.ts, CLAUDE.md «Ошибки»):
// один маппер вместо русского `message:` в каждом из ~130 декораторов DTO
// (CLAUDE.md «Одна механика — один компонент»). DomainExceptionFilter
// получает от BadRequestException(formatValidationErrors(errors)) тот же
// string[] в `message`, что и раньше от class-validator, — меняется только
// содержимое строк, не форма конверта.
import type { ValidationError } from 'class-validator';
import { FIELD_LABELS_RU } from '@xuanxue/shared';
import { constraintText } from './validation-constraint-text';

// Единственное число для нумерации элементов массива объектов в пути
// ошибки («Правило 2: …») — деталь форматирования пути, не подпись самого
// поля (у `rules` есть подпись «Правила расписания» в FIELD_LABELS_RU — она
// для сообщений без индекса, см. labelForPath). Других массивов вложенных
// объектов в DTO пока нет (schedule-rule.dto.ts — единственный `@ValidateNested`
// внутри `@IsArray`).
const ARRAY_ITEM_LABEL_RU: Partial<Record<string, string>> = {
  rules: 'Правило',
};

function fieldLabel(name: string): string {
  return FIELD_LABELS_RU[name] ?? name;
}

/**
 * Путь до упавшего поля человекочитаемо. Без индекса — просто подпись поля
 * (`title` → «Название»). С числовым сегментом внутри массива объектов
 * (`rules.0.time`) — «Правило N, подпись вложенного поля»: без номера
 * учитель не понял бы, какое из нескольких одинаковых «время» в разных
 * правилах расписания не прошло проверку.
 */
function labelForPath(path: string[], leaf: string): string {
  const indexAt = path.findIndex((segment) => /^\d+$/.test(segment));
  if (indexAt === -1) return fieldLabel(leaf);
  const arrayField = path[indexAt - 1] ?? '';
  const itemNumber = Number(path[indexAt]) + 1;
  const itemLabel = ARRAY_ITEM_LABEL_RU[arrayField] ?? fieldLabel(arrayField);
  const rest = path.slice(indexAt + 1).map(fieldLabel);
  return [`${itemLabel} ${itemNumber}`, ...rest].join(', ');
}

function formatOne(error: ValidationError, parentPath: string[]): string[] {
  const path = [...parentPath, error.property];
  const messages: string[] = [];
  if (error.constraints) {
    const label = labelForPath(path, error.property);
    for (const [constraintKey, message] of Object.entries(error.constraints)) {
      messages.push(`${label}: ${constraintText(constraintKey, message)}`);
    }
  }
  for (const child of error.children ?? []) {
    messages.push(...formatOne(child, path));
  }
  return messages;
}

/** exceptionFactory: ValidationError[] от class-validator → строки для
 * `details[]` конверта ошибки, каждая — «Подпись поля: текст по-русски». */
export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => formatOne(error, []));
}
