// Политика полей — один источник правды и для шифрования (encryptRecord/
// decryptRecord через encryptSchemaFrom), и для гейта encryption-coverage.spec:
// у каждого String-поля схемы должно быть явное решение с причиной
// (SECURITY §5). Перечисления (enum) сюда не входят — они тоже 'String' в
// Mongoose, но нужны для фильтров и не считаются свободным текстом.
import type { EncryptSchema } from '../utils/encryption';

type FieldDecision =
  { policy: 'enc' } | { policy: 'encJson' } | { policy: 'plain'; reason: string };

export type FieldPolicy = Record<string, FieldDecision>;

export const enc: FieldDecision = { policy: 'enc' };
export const encJson: FieldDecision = { policy: 'encJson' };

export function plain(reason: string): FieldDecision {
  return { policy: 'plain', reason };
}

// encryptRecord/decryptRecord (api/src/utils/encryption.ts) читают только
// ключи верхнего уровня документа. Вложенному полю (например, будущему полю
// внутри rules или recordings), которому нужно шифрование, — не место в этой
// политике как enc/encJson: оно не сработает молча. Такое поле хранится
// строкой верхнего уровня целиком через encJson, как channels.config.
export function encryptSchemaFrom(policy: FieldPolicy): EncryptSchema {
  const strings: string[] = [];
  const jsonArrays: string[] = [];
  for (const [field, decision] of Object.entries(policy)) {
    if (decision.policy === 'enc') strings.push(field);
    else if (decision.policy === 'encJson') jsonArrays.push(field);
  }
  return { strings, jsonArrays };
}
