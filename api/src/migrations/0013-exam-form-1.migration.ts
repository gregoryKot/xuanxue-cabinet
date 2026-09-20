// Экзамен «Форма 1. Целостная собранность» заезжает в базу миграцией, а не
// только CLI-импортом (`seed:exam`, RUNBOOK §2.3). Причина та же, что у
// расписания школы (ADR-0019): CLI требует продовых `MONGODB_URI` и
// `ENCRYPTION_KEY` на машине того, кто его запускает, а владелец школы не
// готов держать боевые секреты локально. ADR-0064 (дополнение 2026-09-20)
// признаёт первоначальный выбор («только CLI») неверным по этому же доводу
// и переносит первый заезд сюда — миграция едет вместе с деплоем и
// применяется на Railway сама, где обе переменные уже лежат. CLI остаётся
// вторым путём: повторный импорт и вопросы, дописанные в файл после первого
// заезда, — не задача этой миграции.
//
// Идемпотентность здесь грубее, чем у CLI (seed-exam.service.ts): миграция
// смотрит только на `title` формы. Уже есть форма с таким названием —
// заведённая этой же миграцией раньше или руками через CLI до неё — миграция
// не делает вообще ничего (ни вопросов, ни картинок) и выходит. Дописывать
// новый вопрос в существующую форму — работа CLI, у миграции такого случая
// нет по построению: она нужна только для самого первого заезда на чистую
// базу.
//
// Пишем сырыми документами через драйвер (см. шапку 0001-school-classes) —
// миграция не должна тянуть за собой сегодняшнюю версию схемы Mongoose,
// поэтому все поля, которые сервисы (ExamsService/ExamItemsService)
// проставили бы сами (version, history, status, таймстемпы), выписаны явно.
// Разбор и валидация файла — существующие parseExamSeedFile/validateExamSeed
// (своей копии правил нет), шифрование — существующие encryptRecord/
// encryptBytes и схемы EXAM_ITEM_ENCRYPT_SCHEMA/EXAM_ENCRYPT_SCHEMA,
// идентификаторы вариантов — существующая mapOptions.
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { mongo } from 'mongoose';
import type { ExamItemOptionInput } from '@xuanxue/shared';
import { decrypt, encryptRecord, isEncryptionConfigured } from '../utils/encryption';
import { encryptBytes } from '../utils/encryption-bytes';
import {
  parseExamImageUpload,
  type ParsedExamImage,
} from '../exam-images/exam-image-upload';
import { collectImageIds, mapOptions } from '../exams/exam-item-options';
import { EXAM_ITEM_ENCRYPT_SCHEMA } from '../exams/exam-item.schema';
import { DEFAULT_ATTEMPTS_ALLOWED, EXAM_ENCRYPT_SCHEMA } from '../exams/exam.schema';
import { keepOrGenerateId } from '../exams/sub-id';
import {
  parseExamSeedFile,
  validateExamSeed,
  type ExamSeedQuestion,
} from '../seed/seed-exam-file';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает с тем,
// что отдаёт `connection.db` — без второй копии пакета `mongodb` в дереве
// зависимостей.
const { ObjectId } = mongo;
type Db = mongo.Db;

const EXAMS_COLLECTION = 'exams';
const EXAM_ITEMS_COLLECTION = 'exam_items';
const EXAM_IMAGES_COLLECTION = 'exam_images';

// `api/dist/migrations` (прод) и `api/src/migrations` (dev) — оба на два
// уровня ниже `api/`, поэтому путь до `api/seed` от `__dirname` одинаковый
// в обоих случаях (см. шапку файла).
const SEED_DIR = resolve(__dirname, '..', '..', 'seed');
const SEED_JSON_PATH = join(SEED_DIR, 'exam-form-1.json');

const MISSING_KEY_MESSAGE =
  'Миграция 0013-exam-form-1: не задан ENCRYPTION_KEY — формулировки вопросов и байты ' +
  'картинок легли бы в базу открытым текстом. Задайте тот же ключ, что в Railway.';

function isEnoentError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Файла нет — миграция не может смолчать (правило «битая миграция не
 * поднимает приложение», шапка migration.runner.ts): в отличие от
 * необязательных ссылок Zoom (0003), этот файл — обещанное содержимое
 * первого экзамена, а не опциональная надстройка. Путь параметром, а не
 * прямо константой `SEED_JSON_PATH` — иначе оба исхода (файла нет; файл
 * есть, но не читается по другой причине) нечем было бы покрыть тестом, не
 * трогая настоящий `api/seed/exam-form-1.json` на диске (спек подставляет
 * заведомо отсутствующий и заведомо не-файловый путь). */
async function readSeedJson(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoentError(err)) {
      throw new Error(
        `Миграция 0013-exam-form-1: файла сида нет — ${path}. Приложение не поднимается ` +
          'без обещанного содержимого экзамена.',
      );
    }
    throw err;
  }
}

interface LoadedImage {
  path: string;
  parsed: ParsedExamImage;
}

/** Байты каждой картинки, на которую ссылается хоть один вариант, — по
 * одному разу на уникальный путь (тот же приём, что loadImages в
 * seed-exam.service.ts), до какой-либо записи в базу: битая или
 * отсутствующая картинка не должна всплыть на середине импорта. `seedDir` —
 * параметром по той же причине, что у `readSeedJson` выше. */
async function loadUniqueImages(
  questions: readonly ExamSeedQuestion[],
  seedDir: string,
): Promise<LoadedImage[]> {
  const paths = new Set<string>();
  for (const question of questions) {
    for (const path of question.optionImagePaths) {
      if (path !== undefined) paths.add(path);
    }
  }

  const loaded: LoadedImage[] = [];
  for (const path of paths) {
    const absolutePath = join(seedDir, path);
    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch (err) {
      if (isEnoentError(err)) {
        throw new Error(
          `Миграция 0013-exam-form-1: файла картинки нет — ${absolutePath} (указан как ` +
            `"${path}" в exam-form-1.json).`,
        );
      }
      throw err;
    }
    loaded.push({ path, parsed: parseExamImageUpload(bytes) });
  }
  return loaded;
}

interface ExamTitleRow {
  [key: string]: unknown;
  title: string;
}

/** Форма с таким `title` уже есть — заведена этой же миграцией раньше или
 * руками через CLI до неё (ADR-0064, дополнение 2026-09-20). `title`
 * зашифрован, Mongo не умеет сравнить его сам — читаем все формы и
 * расшифровываем на стороне миграции (тот же приём, что upsertExam в
 * seed-exam.service.ts, только здесь достаточно факта совпадения). */
async function examAlreadyImported(db: Db, title: string): Promise<boolean> {
  const docs = await db
    .collection<ExamTitleRow>(EXAMS_COLLECTION)
    .find({}, { projection: { title: 1 } })
    .toArray();
  return docs.some((doc) => decrypt(doc.title) === title);
}

/** Варианты вопроса с плейсхолдером imageId (parseExamSeedFile) заменяются
 * на настоящий id только что загруженной картинки — тот же порядок, что
 * importQuestions в seed-exam.service.ts. Путь без картинки не найдётся в
 * `imageIdByPath` никогда при вызове из `up()`: loadUniqueImages загружает
 * ровно те пути, что перечислены в `optionImagePaths` всех вопросов, —
 * бросок ниже защита в глубину на случай рассинхронизации, а не рабочий
 * путь (тот же приём, что «запись не найдена сразу после создания» в
 * ExamImagesService.upload). Экспортирована ради этой самой ветки: без
 * реального рассинхрона её нечем покрыть тестом через `up()`. */
export function withRealImageIds(
  question: ExamSeedQuestion,
  imageIdByPath: ReadonlyMap<string, string>,
): ExamItemOptionInput[] {
  const options = question.item.options ?? [];
  return options.map((option, index) => {
    const path = question.optionImagePaths[index];
    if (path === undefined) return option;
    const imageId = imageIdByPath.get(path);
    if (imageId === undefined) {
      throw new Error(
        `Миграция 0013-exam-form-1: картинка "${path}" не была загружена заранее ` +
          '(внутренняя ошибка миграции).',
      );
    }
    return { ...option, imageId };
  });
}

export const seedExamForm1 = {
  id: '0013-exam-form-1',
  // `seedJsonPath`/`seedDir` — с умолчаниями на настоящие пути, вторым и
  // третьим параметром сверх интерфейса `Migration` (раннер зовёт `up(db)`
  // одним аргументом, умолчания и отработают). Только ради теста: файл сида
  // в проде и в CI один и тот же, но чтобы проверить отказ на отсутствующем
  // или битом файле, спек не должен трогать настоящий
  // `api/seed/exam-form-1.json` — подставляет свой временный путь.
  async up(
    db: Db,
    seedJsonPath: string = SEED_JSON_PATH,
    seedDir: string = SEED_DIR,
  ): Promise<void> {
    const text = await readSeedJson(seedJsonPath);
    const { errors, exam, questions } = validateExamSeed(parseExamSeedFile(text));
    if (errors.length > 0) {
      throw new Error(
        `Миграция 0013-exam-form-1: файл сида не проходит валидацию (${errors.length}): ` +
          errors.map((e) => `${e.path}: ${e.message}`).join('; '),
      );
    }

    const images = await loadUniqueImages(questions, seedDir);

    // ДО любой записи — без ключа формулировки и байты картинок легли бы в
    // базу открытым текстом (тот же приём, что seed-exam.service.ts).
    if (!isEncryptionConfigured()) throw new Error(MISSING_KEY_MESSAGE);

    if (await examAlreadyImported(db, exam.title)) return;

    const now = new Date();

    const imageIdByPath = new Map<string, string>();
    const imagesCollection = db.collection(EXAM_IMAGES_COLLECTION);
    for (const image of images) {
      const _id = new ObjectId();
      await imagesCollection.insertOne({
        _id,
        bytes: encryptBytes(image.parsed.bytes),
        contentType: image.parsed.contentType,
        sizeBytes: image.parsed.bytes.length,
        createdAt: now,
        updatedAt: now,
      });
      imageIdByPath.set(image.path, _id.toString());
    }

    const itemsCollection = db.collection(EXAM_ITEMS_COLLECTION);
    const itemIds: string[] = [];
    for (const question of questions) {
      const mappedOptions = mapOptions(withRealImageIds(question, imageIdByPath));
      const itemPayload: Record<string, unknown> = {
        prompt: question.item.prompt,
        hint: question.item.hint,
        criteria: question.item.criteria,
        options: mappedOptions,
        history: [],
      };
      const encryptedItem = encryptRecord(itemPayload, EXAM_ITEM_ENCRYPT_SCHEMA);

      const _id = new ObjectId();
      // hint/criteria — условным спредом, а не `hint: undefined`: драйвер
      // Mongo кладёт `undefined` в документ как `null` (проверено), тогда
      // как ExamItemsService при отсутствии поля не пишет его вовсе. Два
      // разных вида «подсказки нет» в одной коллекции — та же ловушка, что
      // `?? false` у форм старше ADR-0033 (exam.mapper.ts).
      await itemsCollection.insertOne({
        _id,
        kind: question.item.kind,
        prompt: encryptedItem.prompt,
        ...(encryptedItem.hint !== undefined ? { hint: encryptedItem.hint } : {}),
        ...(encryptedItem.criteria !== undefined
          ? { criteria: encryptedItem.criteria }
          : {}),
        options: encryptedItem.options,
        tags: question.item.tags ?? [],
        status: 'published',
        version: 1,
        history: encryptedItem.history,
        imageIds: collectImageIds(mappedOptions, []).map((id) => new ObjectId(id)),
        createdAt: now,
        updatedAt: now,
      });
      itemIds.push(_id.toString());
    }

    const examPayload: Record<string, unknown> = {
      title: exam.title,
      description: exam.description,
      level: exam.level,
      // Один блок на весь состав файла, в его порядке (ADR-0064): для
      // учителя экзамен — один список (ADR-0033), делить 56 вопросов из
      // файла на блоки было бы решением, которого файл сам не выражает.
      blocks: [{ id: keepOrGenerateId(undefined), title: '', itemIds, shuffle: false }],
    };
    const encryptedExam = encryptRecord(examPayload, EXAM_ENCRYPT_SCHEMA);

    await db.collection(EXAMS_COLLECTION).insertOne({
      _id: new ObjectId(),
      title: encryptedExam.title,
      // description/level — условным спредом по той же причине, что
      // hint/criteria у вопроса выше.
      ...(encryptedExam.description !== undefined
        ? { description: encryptedExam.description }
        : {}),
      ...(encryptedExam.level !== undefined ? { level: encryptedExam.level } : {}),
      blocks: encryptedExam.blocks,
      shuffleOptions: exam.shuffleOptions ?? false,
      attemptsAllowed: exam.attemptsAllowed ?? DEFAULT_ATTEMPTS_ALLOWED,
      ...(exam.timeLimitMin !== undefined ? { timeLimitMin: exam.timeLimitMin } : {}),
      // Публикует учитель (см. шапку файла) — статус миграция не меняет
      // никогда, ни при первом заезде, ни при повторном прогоне.
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
  },
};
