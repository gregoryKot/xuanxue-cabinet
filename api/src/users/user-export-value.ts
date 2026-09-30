// Значение из lean-документа Mongoose → то, что переживает JSON (ADR-0160):
// ObjectId становится строкой, Date — ISO 8601 UTC с Z (CLAUDE.md «API»),
// вложенные массивы и объекты обходятся, `undefined` пропадает. Байтам здесь
// не место — поля с Buffer в выгрузку не входят (user-export.registry.ts,
// `omit`), и сериализатор не притворяется, что умеет их показать.
import { Types } from 'mongoose';
import type { ExportRecord, ExportValue } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';

export function toExportValue(value: unknown): ExportValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return toIsoUtc(value);
  if (Array.isArray(value)) return value.map(toExportValue);
  if (typeof value === 'object') return toExportObject(value as Record<string, unknown>);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new Error(`toExportValue: тип ${typeof value} в выгрузку не входит`);
}

/** Поле со значением `undefined` пропускается, а не превращается в `null`:
 * «поля нет» и «поле пустое» в выгрузке различаются так же, как в базе. */
export function toExportObject(source: Record<string, unknown>): ExportRecord {
  const out: ExportRecord = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) out[key] = toExportValue(value);
  }
  return out;
}
