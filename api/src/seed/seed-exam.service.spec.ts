// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): первый запуск создаёт форму-черновик и все вопросы файла-образца
// (api/seed/exam-form-1.json), второй — ноль дублей (идемпотентность по
// prompt/title, read-after-write через ExamsService/ExamItemsService);
// файл с добавленным вопросом дописывает его в конец состава; без
// ENCRYPTION_KEY — отказ до записи; prompt в сырой Mongo — шифротекст.
import { randomUUID } from 'crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { Connection, Model } from 'mongoose';
import { InvalidInputError } from '../common/errors';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { ExamItemsService } from '../exams/exam-items.service';
import { ExamRecord, ExamSchema } from '../exams/exam.schema';
import { ExamsService } from '../exams/exams.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { SeedExamService } from './seed-exam.service';

// Изолированный require после jest.resetModules() — тот же приём, что
// seed.service.spec.ts/encryption.spec.ts: encryption.ts читает
// ENCRYPTION_KEY один раз при импорте модуля, обычный import увидел бы
// старое значение.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const freshRequire = <T>(id: string): T => require(id) as T;

const SAMPLE_PATH = join(__dirname, '..', '..', 'seed', 'exam-form-1.json');
const SAMPLE_DIR = dirname(SAMPLE_PATH);

interface RawSeedQuestion {
  prompt: string;
  options: { image?: string }[];
}

interface RawSeed {
  exam: unknown;
  questions: RawSeedQuestion[];
}

async function readSample(): Promise<RawSeed> {
  const text = await readFile(SAMPLE_PATH, 'utf8');
  return JSON.parse(text) as RawSeed;
}

describe('SeedExamService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let examModel: Model<ExamRecord>;
  let itemModel: Model<ExamItemRecord>;
  let imageModel: Model<ExamImageRecord>;
  let examsService: ExamsService;
  let examItemsService: ExamItemsService;
  let examImagesService: ExamImagesService;
  let seedExamService: SeedExamService;
  let dir: string;
  let sample: RawSeed;
  let uniqueImagePaths: string[];

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    examModel = connection.model<ExamRecord>(ExamRecord.name, ExamSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name, ExamImageSchema);
    const attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    examImagesService = new ExamImagesService(imageModel, attemptModel);
    examItemsService = new ExamItemsService(itemModel, examModel, examImagesService);
    examsService = new ExamsService(examModel, itemModel, attemptModel);
    seedExamService = new SeedExamService(
      examModel,
      itemModel,
      examsService,
      examItemsService,
      examImagesService,
    );
    dir = await mkdtemp(join(tmpdir(), 'xuanxue-seed-exam-'));

    sample = await readSample();
    uniqueImagePaths = [
      ...new Set(
        sample.questions
          .flatMap((q) => q.options.map((o) => o.image))
          .filter((path): path is string => path !== undefined),
      ),
    ];
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
    await rm(dir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await examModel.deleteMany({});
    await itemModel.deleteMany({});
    await imageModel.deleteMany({});
  });

  async function soleExam() {
    const exams = await examsService.list({});
    const [first] = exams;
    if (first === undefined) throw new Error('exam не найден в списке');
    return examsService.getById(first.id);
  }

  it('первый запуск: черновик формы со всеми вопросами файла, картинки загружены (read-after-write)', async () => {
    const report = await seedExamService.importExam(SAMPLE_PATH);

    expect(report.examCreated).toBe(true);
    expect(report.createdQuestions).toHaveLength(sample.questions.length);
    expect(report.skippedQuestions).toHaveLength(0);
    expect(report.uploadedImages).toBe(uniqueImagePaths.length);

    const exam = await soleExam();
    expect(exam.status).toBe('draft');
    expect(exam.blocks).toHaveLength(1);

    const items = await examItemsService.list({ limit: sample.questions.length });
    expect(items).toHaveLength(sample.questions.length);
    const idByPrompt = new Map(items.map((item) => [item.prompt, item.id]));

    // Порядок вопросов формы — порядок файла.
    expect(exam.blocks[0]?.itemIds).toEqual(
      sample.questions.map((q) => idByPrompt.get(q.prompt)),
    );

    // Вопросы с картинками — у всех вариантов проставлен imageId, отмеченный
    // верный вариант сохранён.
    const withImages = sample.questions.filter((q) =>
      q.options.some((o) => o.image !== undefined),
    );
    expect(withImages.length).toBeGreaterThan(0);
    for (const question of withImages) {
      const id = idByPrompt.get(question.prompt);
      const item = items.find((i) => i.id === id);
      expect(item?.options.every((o) => o.imageId !== undefined)).toBe(true);
      expect(item?.options.some((o) => o.correct)).toBe(true);
    }

    expect(await imageModel.countDocuments({})).toBe(uniqueImagePaths.length);
  });

  it('второй запуск того же файла — ноль новых документов, всё пропущено', async () => {
    await seedExamService.importExam(SAMPLE_PATH);
    const examsAfterFirst = await examModel.countDocuments({});
    const itemsAfterFirst = await itemModel.countDocuments({});
    const imagesAfterFirst = await imageModel.countDocuments({});

    const second = await seedExamService.importExam(SAMPLE_PATH);

    expect(second.examCreated).toBe(false);
    expect(second.createdQuestions).toHaveLength(0);
    expect(second.skippedQuestions).toHaveLength(sample.questions.length);
    expect(second.uploadedImages).toBe(0);
    expect(await examModel.countDocuments({})).toBe(examsAfterFirst);
    expect(await itemModel.countDocuments({})).toBe(itemsAfterFirst);
    expect(await imageModel.countDocuments({})).toBe(imagesAfterFirst);
  });

  it('файл с добавленным вопросом дописывает его в конец состава, старые вопросы не трогает', async () => {
    await seedExamService.importExam(SAMPLE_PATH);
    const examBefore = await soleExam();
    const orderBefore = examBefore.blocks[0]?.itemIds ?? [];

    // Копия картинок рядом с новым файлом — относительные пути старых
    // вопросов ведут в подкаталог "exam-form-1/…" от каталога САМОГО файла
    // (см. шапку seed-exam-file.ts), а этот файл лежит не в api/seed/, а во
    // временном каталоге теста.
    await cp(join(SAMPLE_DIR, 'exam-form-1'), join(dir, 'exam-form-1'), {
      recursive: true,
    });

    const extraPrompt = 'Дополнительный вопрос, добавленный тестом';
    const extended = {
      exam: sample.exam,
      questions: [...sample.questions, { kind: 'text', prompt: extraPrompt }],
    };
    const extendedPath = join(dir, `${randomUUID()}.json`);
    await writeFile(extendedPath, JSON.stringify(extended), 'utf8');

    const second = await seedExamService.importExam(extendedPath);

    expect(second.examCreated).toBe(false);
    expect(second.createdQuestions).toEqual([extraPrompt]);
    expect(second.skippedQuestions).toHaveLength(sample.questions.length);

    const examAfter = await examsService.getById(examBefore.id);
    const orderAfter = examAfter.blocks[0]?.itemIds ?? [];
    expect(orderAfter).toHaveLength(sample.questions.length + 1);
    expect(orderAfter.slice(0, sample.questions.length)).toEqual(orderBefore);
  });

  it('лишний вопрос формы, которого нет в файле, при повторном импорте остаётся в конце и не дублируется', async () => {
    await seedExamService.importExam(SAMPLE_PATH);
    const examBefore = await soleExam();
    const orderBefore = examBefore.blocks[0]?.itemIds ?? [];

    // Учитель мог добавить в блок вопрос прямо в кабинете — mergeItemIds не
    // должен ни потерять его, ни продублировать при следующем импорте того
    // же файла.
    const extra = await examItemsService.create({
      kind: 'text',
      prompt: 'Вопрос, добавленный в форму без файла сида',
    });
    await examsService.update(examBefore.id, {
      blocks: [{ itemIds: [...orderBefore, extra.id] }],
    });

    const second = await seedExamService.importExam(SAMPLE_PATH);

    expect(second.examCreated).toBe(false);
    const examAfter = await examsService.getById(examBefore.id);
    const orderAfter = examAfter.blocks[0]?.itemIds ?? [];
    // Порядок файла — впереди без изменений, лишний id — один раз в конце.
    expect(orderAfter).toEqual([...orderBefore, extra.id]);
  });

  it('в сырой Mongo prompt вопроса — шифротекст, не открытый текст', async () => {
    await seedExamService.importExam(SAMPLE_PATH);

    const plainPrompts = new Set(sample.questions.map((q) => q.prompt));
    const rawDocs = await itemModel.find().lean();
    expect(rawDocs.length).toBeGreaterThan(0);
    for (const doc of rawDocs) {
      expect(plainPrompts.has(doc.prompt)).toBe(false);
    }
  });

  it('в файле сида указан путь к несуществующей картинке — отказ до записи, путь назван', async () => {
    const filePath = join(dir, `${randomUUID()}.json`);
    await writeFile(
      filePath,
      JSON.stringify({
        exam: { title: 'Экзамен с несуществующей картинкой' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос с картинкой мимо диска',
            options: [
              { text: 'А', image: 'net-takogo-fayla.png', correct: true },
              { text: 'Б' },
            ],
          },
        ],
      }),
      'utf8',
    );

    // Один и тот же промис для обеих проверок — importExam зовётся один раз,
    // а не дважды ради двух expect().
    const failure = seedExamService.importExam(filePath);
    await expect(failure).rejects.toThrow(InvalidInputError);
    await expect(failure).rejects.toThrow('net-takogo-fayla.png');

    // ДО любой записи — как и остальные отказы importExam (см. тест без
    // ENCRYPTION_KEY ниже): ни вопроса, ни картинки, ни формы.
    expect(await itemModel.countDocuments({})).toBe(0);
    expect(await imageModel.countDocuments({})).toBe(0);
    expect(await examModel.countDocuments({})).toBe(0);
  });

  it('ошибка чтения картинки не ENOENT (путь — каталог, EISDIR) — прокидывается как есть', async () => {
    const imageDirName = `${randomUUID()}-dir`;
    await mkdir(join(dir, imageDirName));
    const filePath = join(dir, `${randomUUID()}.json`);
    await writeFile(
      filePath,
      JSON.stringify({
        exam: { title: 'Экзамен с картинкой-каталогом' },
        questions: [
          {
            kind: 'single',
            prompt: 'Вопрос, у которого путь к картинке — каталог',
            options: [{ text: 'А', image: imageDirName, correct: true }, { text: 'Б' }],
          },
        ],
      }),
      'utf8',
    );

    // EISDIR — не ENOENT: loadImages не подменяет его понятным текстом про
    // отсутствующий файл, читатель отчёта увидел бы неверную причину отказа.
    await expect(seedExamService.importExam(filePath)).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });

  it('без ENCRYPTION_KEY — отказ до записи (в exam_items и exam_images пусто)', async () => {
    type SeedExamServiceModule = typeof import('./seed-exam.service');

    const prevKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    jest.resetModules();
    const { SeedExamService: FreshSeedExamService } =
      freshRequire<SeedExamServiceModule>('./seed-exam.service');
    const freshService = new FreshSeedExamService(
      examModel,
      itemModel,
      examsService,
      examItemsService,
      examImagesService,
    );

    try {
      await expect(freshService.importExam(SAMPLE_PATH)).rejects.toThrow(
        'ENCRYPTION_KEY',
      );
      expect(await itemModel.countDocuments({})).toBe(0);
      expect(await imageModel.countDocuments({})).toBe(0);
      expect(await examModel.countDocuments({})).toBe(0);
    } finally {
      process.env.ENCRYPTION_KEY = prevKey;
      jest.resetModules();
    }
  });
});
