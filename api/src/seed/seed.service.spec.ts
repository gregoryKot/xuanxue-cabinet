// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): первый запуск создаёт все классы, второй — ноль (идемпотентность
// по (title, groupLabel), PLAN.md §9); read-after-write через
// ClassesService.list; zoomLink/zoomPassword в сырой Mongo — шифротекст.
import { randomUUID } from 'crypto';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { ClassesService } from '../classes/classes.service';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { SeedService, SeedValidationFailedError } from './seed.service';

// Изолированный require после jest.resetModules() — тот же приём, что
// encryption.spec.ts (loadWithEnv): encryption.ts читает ENCRYPTION_KEY один
// раз при импорте модуля, обычный import увидел бы старое значение.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const freshRequire = <T>(id: string): T => require(id) as T;

const VALID_SEED = {
  tz: 'Asia/Jerusalem',
  classes: [
    {
      title: 'Медитация чжи-гуань',
      groupLabel: '',
      format: 'online',
      rules: [{ weekday: 0, time: '08:00', durationMin: 60 }],
      zoomLink: 'https://zoom.us/j/000000000',
    },
    {
      title: 'Цзибеньгун',
      groupLabel: 'средняя группа',
      format: 'online',
      zoomPassword: '123456',
    },
  ],
};

describe('SeedService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let channelModel: Model<ChannelRecord>;
  let userModel: Model<UserRecord>;
  let classesService: ClassesService;
  let seedService: SeedService;
  let dir: string;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    classesService = new ClassesService(classModel, lessonModel, channelModel, userModel);
    seedService = new SeedService(classModel, classesService);
    dir = await mkdtemp(join(tmpdir(), 'xuanxue-seed-'));
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
    await rm(dir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await classModel.deleteMany({});
    await channelModel.deleteMany({});
  });

  async function writeSeed(content: unknown): Promise<string> {
    const path = join(dir, `${randomUUID()}.json`);
    await writeFile(path, JSON.stringify(content), 'utf8');
    return path;
  }

  it('первый запуск создаёт все классы, второй — ноль (идемпотентность)', async () => {
    const path = await writeSeed(VALID_SEED);

    const first = await seedService.importClasses(path);
    expect(first.created).toHaveLength(2);
    expect(first.skipped).toHaveLength(0);

    const second = await seedService.importClasses(path);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
  });

  it('read-after-write: ClassesService.list видит импортированные классы', async () => {
    const path = await writeSeed(VALID_SEED);
    await seedService.importClasses(path);

    const list = await classesService.list({});

    expect(list.map((c) => c.title).sort()).toEqual([
      'Медитация чжи-гуань',
      'Цзибеньгун',
    ]);
  });

  it('импорт без channelIds в файле — классы получают активные Telegram-каналы (фикс «занятие без каналов»)', async () => {
    const telegram = await channelModel.create({
      type: 'telegram',
      title: 'Группа учеников',
      config: '{}',
      target: '@group',
      active: true,
    });
    const path = await writeSeed(VALID_SEED);

    await seedService.importClasses(path);

    // Read-after-write: то же, что увидит планировщик через
    // ClassesService.list — не сырой Mongo.
    const list = await classesService.list({});
    for (const cls of list) {
      expect(cls.channelIds).toEqual([telegram._id.toString()]);
    }
  });

  it('zoomLink/zoomPassword в сырой Mongo — шифротекст, не сам секрет', async () => {
    const path = await writeSeed(VALID_SEED);
    await seedService.importClasses(path);

    const withLink = await classModel.findOne({ title: 'Медитация чжи-гуань' }).lean();
    expect(withLink?.zoomLink).toBeDefined();
    expect(withLink?.zoomLink).not.toContain('zoom.us');

    const withPassword = await classModel.findOne({ title: 'Цзибеньгун' }).lean();
    expect(withPassword?.zoomPassword).toBeDefined();
    expect(withPassword?.zoomPassword).not.toContain('123456');
  });

  it('tz файла подставляется классу без своего tz', async () => {
    const path = await writeSeed(VALID_SEED);
    await seedService.importClasses(path);

    const found = await classesService.list({});
    const withoutOwnTz = found.find((c) => c.title === 'Цзибеньгун');

    expect(withoutOwnTz?.tz).toBe('Asia/Jerusalem');
  });

  it('невалидный сид — SeedValidationFailedError с путём ошибки', async () => {
    const path = await writeSeed({
      tz: 'Asia/Jerusalem',
      classes: [
        {
          title: 'Тайцзицюань',
          format: 'online',
          rules: [{ weekday: 1, time: '25:00', durationMin: 60 }],
        },
      ],
    });

    await expect(seedService.importClasses(path)).rejects.toThrow(
      SeedValidationFailedError,
    );
    const created = await classModel.countDocuments({});
    expect(created).toBe(0);
  });

  it('дубли по (title, groupLabel) не мешают классу с тем же названием и другой группой', async () => {
    const path = await writeSeed({
      tz: 'Asia/Jerusalem',
      classes: [
        { title: 'Цзибеньгун', groupLabel: 'средняя группа', format: 'online' },
        { title: 'Цзибеньгун', groupLabel: 'начинающие', format: 'online' },
      ],
    });

    const report = await seedService.importClasses(path);

    expect(report.created).toHaveLength(2);
  });

  it('title обрезан пробелами, лишнее поле "_id" из файла не попадает в документ', async () => {
    const path = await writeSeed({
      tz: 'Asia/Jerusalem',
      classes: [{ _id: 'ignored', title: '  Тайцзицюань  ', format: 'online' }],
    });

    const report = await seedService.importClasses(path);
    expect(report.created).toEqual(['Тайцзицюань']);

    const raw = await classModel.findOne({ title: 'Тайцзицюань' }).lean();
    expect(raw?.title).toBe('Тайцзицюань');
    expect(String(raw?._id)).not.toBe('ignored');
  });

  it('без ENCRYPTION_KEY и с секретом в файле — отказ до записи в базу', async () => {
    type ClassesServiceModule = typeof import('../classes/classes.service');
    type SeedServiceModule = typeof import('./seed.service');

    const prevKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    jest.resetModules();
    const { ClassesService: FreshClassesService } = freshRequire<ClassesServiceModule>(
      '../classes/classes.service',
    );
    const { SeedService: FreshSeedService } =
      freshRequire<SeedServiceModule>('./seed.service');
    const freshClassesService = new FreshClassesService(
      classModel,
      lessonModel,
      channelModel,
      userModel,
    );
    const freshSeedService = new FreshSeedService(classModel, freshClassesService);

    try {
      const path = await writeSeed(VALID_SEED);

      await expect(freshSeedService.importClasses(path)).rejects.toThrow(
        'ENCRYPTION_KEY',
      );
      expect(await classModel.countDocuments({})).toBe(0);
    } finally {
      process.env.ENCRYPTION_KEY = prevKey;
      jest.resetModules();
    }
  });
});
