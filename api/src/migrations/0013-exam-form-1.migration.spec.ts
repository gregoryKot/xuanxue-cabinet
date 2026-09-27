// Миграция пишет сырыми документами через драйвер, минуя схему Mongoose —
// поэтому проверяем read-after-write моделью и существующими мапперами
// (CLAUDE.md «Тесты»), как 0001-school-classes.migration.spec.ts. Числа
// (вопросы, картинки) считаем из самого файла сида, не хардкодим — тот же
// приём, что seed-exam.service.spec.ts. Устройство ENCRYPTION_KEY/
// freshRequire — оттуда же: encryption.ts читает ключ один раз при импорте
// модуля, обычный import увидел бы старое значение.
//
// Отказы на отсутствующем/битом файле сида и картинки (missing-file,
// EISDIR, невалидный JSON) — на временных файлах через второй/третий
// параметр `up()` (seedJsonPath/seedDir), тем же приёмом, что
// seed-exam.service.spec.ts проверяет loadImages через сам `filePath`:
// настоящий `api/seed/exam-form-1.json` эти тесты не трогают.
import { randomUUID } from 'crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import type { Connection, Model, mongo } from 'mongoose';
import { ExamImageRecord } from '../exam-images/exam-image.schema';
import { CreateExamItemDto } from '../exams/dto/create-exam-item.dto';
import { decryptExamItem, type RawLeanExamItem } from '../exams/exam-item.mapper';
import { ExamItemRecord } from '../exams/exam-item.schema';
import { decryptExam, type RawLeanExam } from '../exams/exam.mapper';
import { ExamRecord } from '../exams/exam.schema';
import type { ExamSeedQuestion } from '../seed/seed-exam-file';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { seedExamForm1, withRealImageIds } from './0013-exam-form-1.migration';

type Db = mongo.Db;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const freshRequire = <T>(id: string): T => require(id) as T;

const SAMPLE_PATH = join(__dirname, '..', '..', 'seed', 'exam-form-1.json');

interface RawSeedOption {
  image?: string;
  correct?: boolean;
}
interface RawSeedQuestion {
  prompt: string;
  options?: RawSeedOption[];
}
interface RawSeed {
  exam: { title: string };
  questions: RawSeedQuestion[];
}

async function readSample(): Promise<RawSeed> {
  return JSON.parse(await readFile(SAMPLE_PATH, 'utf8')) as RawSeed;
}

describe('Миграция 0013-exam-form-1', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let examModel: Model<ExamRecord>;
  let itemModel: Model<ExamItemRecord>;
  let imageModel: Model<ExamImageRecord>;
  let sample: RawSeed;
  let uniqueImagePaths: string[];
  let dir: string;

  function db(): Db {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    examModel = connection.model<ExamRecord>(ExamRecord.name);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name);
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name);

    sample = await readSample();
    uniqueImagePaths = [
      ...new Set(
        sample.questions
          .flatMap((q) => (q.options ?? []).map((o) => o.image))
          .filter((path): path is string => path !== undefined),
      ),
    ];

    dir = await mkdtemp(join(tmpdir(), 'xuanxue-exam-form-1-migration-'));
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
    await rm(dir, { recursive: true, force: true });
  });

  /** Пишет `content` временным файлом сида в своём подкаталоге `dir` (свой
   * на вызов — тесты этой группы не должны видеть файлы друг друга) и
   * возвращает путь к файлу и к каталогу — вторым и третьим аргументом
   * `up()`. */
  async function writeSeedFile(
    content: unknown,
  ): Promise<{ path: string; seedDir: string }> {
    const seedDir = join(dir, randomUUID());
    await mkdir(seedDir, { recursive: true });
    const path = join(seedDir, 'exam-form-1.json');
    await writeFile(path, JSON.stringify(content), 'utf8');
    return { path, seedDir };
  }

  beforeEach(async () => {
    await examModel.deleteMany({});
    await itemModel.deleteMany({});
    await imageModel.deleteMany({});
  });

  it('создаёт черновик формы со всеми вопросами файла в его порядке и все картинки (read-after-write)', async () => {
    await seedExamForm1.up(db());

    expect(await examModel.countDocuments()).toBe(1);
    expect(await itemModel.countDocuments()).toBe(sample.questions.length);
    expect(await imageModel.countDocuments()).toBe(uniqueImagePaths.length);

    const examDoc = await examModel.findOne().lean<RawLeanExam>();
    if (!examDoc) throw new Error('форма не найдена');
    const exam = decryptExam(examDoc);
    expect(exam.title).toBe(sample.exam.title);
    expect(exam.status).toBe('draft');
    expect(exam.blocks).toHaveLength(1);

    const itemDocs = await itemModel.find().lean<RawLeanExamItem[]>();
    const items = itemDocs.map(decryptExamItem);
    expect(items.every((item) => item.status === 'published' && item.version === 1)).toBe(
      true,
    );
    // Подсказки нет — поля нет вовсе, а не `null`: драйвер Mongo кладёт
    // `undefined` как `null`, и документы миграции разъехались бы по форме
    // с теми, что пишет ExamItemsService. `hint` — историческое поле схемы
    // (ADR-0128 убрал его из RawLeanExamItem), но сырой документ Mongo его
    // ещё несёт — читаем как Record, не как типизированный маппер.
    const rawDocs = itemDocs as unknown as Record<string, unknown>[];
    const withoutHint = rawDocs.find((doc) => doc.hint === undefined);
    expect(withoutHint && 'hint' in withoutHint).toBe(false);
    const idByPrompt = new Map(items.map((item) => [item.prompt, item._id.toString()]));

    // Состав единственного блока — порядок вопросов в файле.
    expect(exam.blocks[0]?.itemIds).toEqual(
      sample.questions.map((q) => idByPrompt.get(q.prompt)),
    );

    // У вопросов с картинками — картинка и отметка верного варианта
    // сохранены на тех же позициях, что в файле (mapOptions не переставляет
    // варианты местами).
    const withImages = sample.questions.filter((q) =>
      (q.options ?? []).some((o) => o.image !== undefined),
    );
    expect(withImages.length).toBeGreaterThan(0);
    for (const question of withImages) {
      const id = idByPrompt.get(question.prompt);
      const item = items.find((i) => i._id.toString() === id);
      if (!item) throw new Error(`вопрос "${question.prompt}" не найден среди созданных`);
      const rawOptions = question.options ?? [];
      expect(item.options).toHaveLength(rawOptions.length);
      item.options.forEach((option, index) => {
        expect(option.imageId).toBeDefined();
        expect(option.correct).toBe(rawOptions[index]?.correct === true);
      });
    }
  });

  it('prompt в сырой базе — шифротекст, не открытый текст', async () => {
    await seedExamForm1.up(db());

    const plainPrompts = new Set(sample.questions.map((q) => q.prompt));
    const rawDocs = await itemModel.find().lean();
    expect(rawDocs).toHaveLength(sample.questions.length);
    for (const doc of rawDocs) {
      expect(plainPrompts.has(doc.prompt)).toBe(false);
    }
  });

  it('повторное применение на базе, где форма уже есть, — не создаёт дублей', async () => {
    await seedExamForm1.up(db());
    await seedExamForm1.up(db());

    expect(await examModel.countDocuments()).toBe(1);
    expect(await itemModel.countDocuments()).toBe(sample.questions.length);
    expect(await imageModel.countDocuments()).toBe(uniqueImagePaths.length);
  });

  it('без ENCRYPTION_KEY — отказ до записи (exams/exam_items/exam_images пусты)', async () => {
    type MigrationModule = typeof import('./0013-exam-form-1.migration');

    const prevKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    jest.resetModules();
    const { seedExamForm1: freshSeedExamForm1 } = freshRequire<MigrationModule>(
      './0013-exam-form-1.migration',
    );

    try {
      await expect(freshSeedExamForm1.up(db())).rejects.toThrow('ENCRYPTION_KEY');
      expect(await examModel.countDocuments()).toBe(0);
      expect(await itemModel.countDocuments()).toBe(0);
      expect(await imageModel.countDocuments()).toBe(0);
    } finally {
      process.env.ENCRYPTION_KEY = prevKey;
      jest.resetModules();
    }
  });

  it('файла сида нет по переданному пути — отказ с этим путём, до записи', async () => {
    const missingPath = join(dir, `${randomUUID()}.json`);

    await expect(seedExamForm1.up(db(), missingPath)).rejects.toThrow(missingPath);
    expect(await examModel.countDocuments()).toBe(0);
  });

  it('путь к файлу сида указывает на каталог (не ENOENT) — исходная ошибка как есть', async () => {
    await expect(seedExamForm1.up(db(), dir)).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('файл сида не проходит валидацию — отказ до записи, без формы и вопросов', async () => {
    const { path, seedDir } = await writeSeedFile({ exam: {}, questions: [] });

    await expect(seedExamForm1.up(db(), path, seedDir)).rejects.toThrow(
      'не проходит валидацию',
    );
    expect(await examModel.countDocuments()).toBe(0);
  });

  it('картинки варианта нет на диске — отказ с путём, до записи (форма и вопросы не созданы)', async () => {
    const { path, seedDir } = await writeSeedFile({
      exam: { title: `Тест: картинка мимо диска ${randomUUID()}` },
      questions: [
        {
          kind: 'single',
          prompt: 'Тестовый вопрос с картинкой мимо диска',
          options: [{ image: 'net-takogo-fayla.jpg', correct: true }, { text: 'Б' }],
        },
      ],
    });

    const failure = seedExamForm1.up(db(), path, seedDir);
    await expect(failure).rejects.toThrow('net-takogo-fayla.jpg');
    expect(await examModel.countDocuments()).toBe(0);
    expect(await itemModel.countDocuments()).toBe(0);
    expect(await imageModel.countDocuments()).toBe(0);
  });

  it('путь к картинке указывает на каталог (не ENOENT) — исходная ошибка как есть', async () => {
    const { path, seedDir } = await writeSeedFile({
      exam: { title: `Тест: картинка — каталог ${randomUUID()}` },
      questions: [
        {
          kind: 'single',
          prompt: 'Тестовый вопрос, у которого путь к картинке — каталог',
          options: [{ image: 'a-directory', correct: true }, { text: 'Б' }],
        },
      ],
    });
    await mkdir(join(seedDir, 'a-directory'));

    await expect(seedExamForm1.up(db(), path, seedDir)).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });

  it('поля level/attemptsAllowed/timeLimitMin файла сида доезжают до формы', async () => {
    const title = `Тест: доп. поля формы ${randomUUID()}`;
    const { path, seedDir } = await writeSeedFile({
      exam: { title, level: 'начальный', attemptsAllowed: 3, timeLimitMin: 45 },
      questions: [{ kind: 'text', prompt: 'Тестовый вопрос без вариантов' }],
    });

    await seedExamForm1.up(db(), path, seedDir);

    const examDoc = await examModel.findOne().lean<RawLeanExam>();
    if (!examDoc) throw new Error('форма не найдена');
    const exam = decryptExam(examDoc);
    expect(exam.title).toBe(title);
    expect(exam.level).toBe('начальный');
    expect(exam.attemptsAllowed).toBe(3);
    expect(exam.timeLimitMin).toBe(45);
  });

  // Юнит-тест защиты в глубину withRealImageIds — без Mongo и без файлов на
  // диске: путь варианта, которого нет в загруженных картинках, у `up()`
  // структурно не бывает (см. комментарий в исходнике), поэтому единственный
  // способ дойти до этой ветки — вызвать функцию напрямую с рассогласованным
  // входом.
  it('withRealImageIds: путь варианта без загруженной картинки — внутренняя ошибка', () => {
    const question: ExamSeedQuestion = {
      item: plainToInstance(CreateExamItemDto, {
        kind: 'single',
        prompt: 'Вопрос для юнит-теста withRealImageIds',
        options: [{ text: 'А' }, { text: 'Б', correct: true }],
      }),
      rawItem: {},
      optionImagePaths: ['путь-без-загрузки.jpg', undefined],
    };

    expect(() => withRealImageIds(question, new Map())).toThrow(
      'не была загружена заранее',
    );
  });
});
