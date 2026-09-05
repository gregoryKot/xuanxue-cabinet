// Гейт SECURITY §5: у каждого свободного String/Mixed-поля схемы — явное
// решение в fieldPolicy (enc/encJson/plain с причиной). Перечисления (enum) —
// тоже 'String' в Mongoose (`type: String, enum: [...]`), но это значения
// для фильтров, не текст, и решения не требуют — отличаем их по
// options.enum, а не по имени поля (иначе classes.format, lessons.status,
// channels.type, broadcasts.kind/status, deliveries.status ломали бы тест
// на собственных схемах этого PR).
import type { Schema, SchemaType } from 'mongoose';
import { MODEL_DEFINITIONS } from './model.registry';

interface FlatPath {
  path: string;
  type: SchemaType;
}

const SKIP_PATHS = new Set(['_id', '__v']);

function isEnumPath(type: SchemaType): boolean {
  // path.options типизирован как AnyObject (mongoose) — сужаем явно, иначе
  // eslint (no-unsafe-assignment/no-unsafe-member-access) ругается на .enum.
  const { enum: values } = type.options as { enum?: readonly unknown[] };
  return Array.isArray(values) && values.length > 0;
}

// Субдокументы (rules, recordings) — Mongoose кладёт их схему в `type.schema`;
// собираем вложенные пути с префиксом (`rules.time`), а не сам путь-массив.
function collectPaths(schema: Schema, prefix = ''): FlatPath[] {
  const out: FlatPath[] = [];
  for (const [name, type] of Object.entries(schema.paths)) {
    if (SKIP_PATHS.has(name)) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    if (type.schema) {
      out.push(...collectPaths(type.schema, path));
    } else if (type.instance === 'Array' && type.getEmbeddedSchemaType()) {
      // Массив примитивов (`[String]`): Mongoose даёт instance 'Array', а тип
      // элемента — в getEmbeddedSchemaType(). Путь оставляем верхнего уровня,
      // чтобы политика могла шифровать поле целиком через encryptRecord.
      const element = type.getEmbeddedSchemaType();
      if (element) out.push({ path, type: element });
    } else {
      out.push({ path, type });
    }
  }
  return out;
}

describe('encryption-coverage', () => {
  for (const def of MODEL_DEFINITIONS) {
    const paths = collectPaths(def.schema);

    describe(def.name, () => {
      it('у каждого текстового поля (кроме перечислений) есть решение', () => {
        const missing = paths
          .filter(({ type }) => type.instance === 'String' && !isEnumPath(type))
          .map(({ path }) => path)
          .filter((path) => !(path in def.fieldPolicy));
        expect(missing).toEqual([]);
      });

      it('в fieldPolicy нет путей, которых нет в схеме — опечатка не дыра', () => {
        const known = new Set(paths.map((p) => p.path));
        const extra = Object.keys(def.fieldPolicy).filter((path) => !known.has(path));
        expect(extra).toEqual([]);
      });

      it('Mixed-полей в схеме нет (CLAUDE.md: Mixed только с причиной)', () => {
        const mixed = paths
          .filter(({ type }) => type.instance === 'Mixed')
          .map(({ path }) => path);
        expect(mixed).toEqual([]);
      });

      it('у plain причина непустая', () => {
        const emptyReasons = Object.entries(def.fieldPolicy)
          .filter(([, d]) => d.policy === 'plain' && d.reason.trim() === '')
          .map(([path]) => path);
        expect(emptyReasons).toEqual([]);
      });

      it('enc/encJson — только для полей верхнего уровня', () => {
        // encryptRecord/decryptRecord (utils/encryption.ts) читают только
        // ключи верхнего уровня — вложенное enc/encJson не сработает молча.
        const nested = Object.entries(def.fieldPolicy)
          .filter(([, d]) => d.policy === 'enc' || d.policy === 'encJson')
          .map(([path]) => path)
          .filter((path) => path.includes('.'));
        expect(nested).toEqual([]);
      });
    });
  }
});
