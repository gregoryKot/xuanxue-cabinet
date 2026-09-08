#!/usr/bin/env node
// Проверка сценария scripts/backup-mongo.sh + scripts/restore-mongo.sh в CI
// (.github/workflows/ci.yml, джоба backup-restore). CLAUDE.md, «Данные
// (MongoDB)»: «Дампы… проверка восстановления» — RUNBOOK §7 обещал ручную
// проверку раз в квартал; здесь та же проверка идёт на каждом PR, а не «по
// памяти». Использует пакет `mongodb` (уже зависимость api, hoisted в корень).
//
// Режимы:
//   seed <uri>              — пишет фиксированный набор документов в коллекцию probe
//   verify <sourceUri> <targetUri> — сравнивает содержимое probe в двух базах
import { MongoClient } from 'mongodb';

const COLLECTION = 'probe';
// Данные для проверки идентичности после восстановления, не для покрытия
// доменной логики — намеренно маленький фиксированный набор.
const SEED_DOCS = [
  { _id: 'a', label: 'первый', n: 1 },
  { _id: 'b', label: 'второй', n: 2 },
  { _id: 'c', label: 'третий с юникодом — «ёж»', n: 3 },
];

async function withClient(uri, fn) {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function seed(uri) {
  await withClient(uri, async (client) => {
    const db = client.db();
    await db.collection(COLLECTION).deleteMany({});
    await db.collection(COLLECTION).insertMany(SEED_DOCS);
  });
  console.log(`✓ засеяно ${SEED_DOCS.length} документов`);
}

// Сортировка по _id перед сравнением: mongorestore не обязан сохранять
// порядок вставки, важно только содержимое.
async function readSorted(uri) {
  return withClient(uri, async (client) => {
    const docs = await client.db().collection(COLLECTION).find({}).toArray();
    return docs.sort((a, b) => String(a._id).localeCompare(String(b._id)));
  });
}

async function verify(sourceUri, targetUri) {
  const [source, target] = await Promise.all([
    readSorted(sourceUri),
    readSorted(targetUri),
  ]);

  if (source.length === 0) {
    throw new Error('в исходной базе пусто — seed не сработал, сравнивать нечего');
  }
  if (source.length !== target.length) {
    throw new Error(
      `число документов не совпадает: было ${source.length}, восстановлено ${target.length}`,
    );
  }
  const sourceJson = JSON.stringify(source);
  const targetJson = JSON.stringify(target);
  if (sourceJson !== targetJson) {
    throw new Error(
      `содержимое не совпадает после восстановления:\n  было: ${sourceJson}\n  стало: ${targetJson}`,
    );
  }
  console.log(`✓ восстановленные ${target.length} документов совпадают с исходными`);
}

const [, , mode, ...args] = process.argv;
try {
  if (mode === 'seed') {
    const [uri] = args;
    await seed(uri);
  } else if (mode === 'verify') {
    const [sourceUri, targetUri] = args;
    await verify(sourceUri, targetUri);
  } else {
    throw new Error(`неизвестный режим "${mode}", ожидается seed|verify`);
  }
} catch (err) {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
}
