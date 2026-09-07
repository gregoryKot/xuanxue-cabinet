// Против настоящей Mongo (CLAUDE.md «Тесты»): расшифровка zoomLinkOverride,
// резолв {ведущий}, стенд-ин записи. Сам рендер плейсхолдеров уже покрыт
// shared/src/templates.spec.ts и post-renderer.spec.ts — здесь только то,
// откуда previewTemplate берёт данные.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { DEFAULT_TEMPLATES } from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord, ClassSchema } from '../classes/class.schema';
import {
  LESSON_ENCRYPT_SCHEMA,
  LessonRecord,
  LessonSchema,
} from '../lessons/lesson.schema';
import { encryptRecord } from '../utils/encryption';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { previewTemplate } from './settings-preview';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const TEMPLATES = DEFAULT_TEMPLATES;

describe('previewTemplate', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let userModel: Model<UserRecord>;
  let usersService: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    usersService = new UsersService(userModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      classModel.deleteMany({}),
      lessonModel.deleteMany({}),
      userModel.deleteMany({}),
    ]);
  });

  // Как в проде: ссылка класса лежит шифротекстом (ClassesService.create) —
  // previewTemplate её расшифровывает через findClassForRecording.
  async function createClass(overrides: Partial<ClassRecord> = {}) {
    return classModel.create(
      encryptRecord(
        {
          title: 'Цигун для глаз',
          groupLabel: '',
          format: 'online',
          zoomLink: 'https://zoom.example/1',
          tz: 'Asia/Jerusalem',
          leadMinutes: 30,
          active: true,
          channelIds: [],
          ...overrides,
        },
        CLASS_ENCRYPT_SCHEMA,
      ),
    );
  }

  async function createLesson(
    classId: Types.ObjectId,
    overrides: Record<string, unknown> = {},
  ) {
    return lessonModel.create(
      encryptRecord(
        {
          classId,
          startsAt: NOW.plus({ minutes: 20 }).toJSDate(),
          durationMin: 60,
          topic: 'Пятое занятие',
          status: 'scheduled',
          ...overrides,
        },
        LESSON_ENCRYPT_SCHEMA,
      ),
    );
  }

  it('lesson_link: подставляет название класса и ссылку', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);

    const result = await previewTemplate(
      lessonModel,
      classModel,
      usersService,
      TEMPLATES,
      'lesson_link',
      lesson._id.toString(),
      NOW,
    );

    expect(result.text).toContain('Цигун для глаз');
    expect(result.text).toContain('https://zoom.example/1');
    expect(result.recordingIsStandIn).toBeUndefined();
  });

  it('lesson_link: zoomLinkOverride расшифрован и приоритетнее ссылки класса', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, {
      zoomLinkOverride: 'https://zoom.example/override',
    });

    const result = await previewTemplate(
      lessonModel,
      classModel,
      usersService,
      TEMPLATES,
      'lesson_link',
      lesson._id.toString(),
      NOW,
    );

    expect(result.text).toContain('https://zoom.example/override');
    expect(result.text).not.toContain('https://zoom.example/1');
  });

  it('recording: без добавленной записи — стенд-ин из темы занятия', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);

    const result = await previewTemplate(
      lessonModel,
      classModel,
      usersService,
      TEMPLATES,
      'recording',
      lesson._id.toString(),
      NOW,
    );

    expect(result.text).toContain('Пятое занятие');
    expect(result.recordingIsStandIn).toBe(true);
  });

  it('recording: без записи и без темы — стенд-ин из названия класса', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, { topic: '' });

    const result = await previewTemplate(
      lessonModel,
      classModel,
      usersService,
      TEMPLATES,
      'recording',
      lesson._id.toString(),
      NOW,
    );

    expect(result.text).toContain('Цигун для глаз');
  });

  it('recording: последняя добавленная запись, не первая', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, {
      recordings: [
        { title: 'Первая версия', url: 'https://drive.example/old' },
        { title: 'Итоговая запись', url: 'https://drive.example/new' },
      ],
    });

    const result = await previewTemplate(
      lessonModel,
      classModel,
      usersService,
      TEMPLATES,
      'recording',
      lesson._id.toString(),
      NOW,
    );

    expect(result.text).toContain('Итоговая запись');
    expect(result.text).toContain('https://drive.example/new');
    expect(result.recordingIsStandIn).toBeUndefined();
  });

  it('{ведущий}: имя занятия приоритетнее имени класса', async () => {
    const classLeader = await userModel.create({ name: 'Аня', roles: ['teacher'] });
    const lessonLeader = await userModel.create({ name: 'Боря', roles: ['teacher'] });
    const cls = await createClass({ leaderId: classLeader._id });
    const lesson = await createLesson(cls._id, { leaderId: lessonLeader._id });

    const result = await previewTemplate(
      lessonModel,
      classModel,
      usersService,
      { ...TEMPLATES, recording: '{название}, ведёт {ведущий}' },
      'recording',
      lesson._id.toString(),
      NOW,
    );

    expect(result.text).toContain('Боря');
    expect(result.text).not.toContain('Аня');
  });

  it('занятие не найдено — NotFoundError', async () => {
    await expect(
      previewTemplate(
        lessonModel,
        classModel,
        usersService,
        TEMPLATES,
        'lesson_link',
        '507f1f77bcf86cd799439011',
        NOW,
      ),
    ).rejects.toThrow('не найдена');
  });

  it('занятие без класса в базе — NotFoundError', async () => {
    const orphanClassId = new Types.ObjectId();
    const lesson = await createLesson(orphanClassId);

    await expect(
      previewTemplate(
        lessonModel,
        classModel,
        usersService,
        TEMPLATES,
        'lesson_link',
        lesson._id.toString(),
        NOW,
      ),
    ).rejects.toThrow('без класса');
  });
});
