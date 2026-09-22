// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): агрегация в MongoDB — не JS-код, мок пропустил бы ошибку в самом
// `$lookup`/`$setUnion`/`$match`. Read-after-write: пишем в lessons/classes/
// materials/channels/exam_items напрямую, считаем сводкой (тот же приём, что
// summary.service.spec.ts).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { MaterialRecord, MaterialSchema } from '../materials/material.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { TagsService } from './tags.service';

describe('TagsService.list', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let materialModel: Model<MaterialRecord>;
  let channelModel: Model<ChannelRecord>;
  let examItemModel: Model<ExamItemRecord>;
  let service: TagsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    materialModel = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    examItemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    service = new TagsService(
      lessonModel,
      classModel,
      materialModel,
      channelModel,
      examItemModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
      materialModel.deleteMany({}),
      channelModel.deleteMany({}),
      examItemModel.deleteMany({}),
    ]);
  });

  async function createClass(tags: string[] = []): Promise<Types.ObjectId> {
    const cls = await classModel.create({ title: 'Курс', format: 'online', tags });
    return cls._id;
  }

  async function createLesson(
    classId: Types.ObjectId,
    tags: string[] = [],
  ): Promise<void> {
    await lessonModel.create({
      classId,
      startsAt: new Date('2026-09-03T16:00:00Z'),
      durationMin: 60,
      tags,
    });
  }

  async function createMaterial(tags: string[]): Promise<void> {
    await materialModel.create({
      title: 'Материал',
      url: 'https://example.com/x',
      kind: 'article',
      createdBy: new Types.ObjectId(),
      tags,
    });
  }

  function createChannel(tags: string[], broadcastEligible = true) {
    return channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: new Types.ObjectId().toString(),
      active: true,
      tags,
      broadcastEligible,
    });
  }

  function createExamItem(tags: string[]) {
    return examItemModel.create({ kind: 'text', prompt: 'Вопрос', tags });
  }

  it('пустая база — пустой список, не ошибка и не мусор', async () => {
    await expect(service.list({})).resolves.toEqual([]);
  });

  it('тег только в материалах — остальные источники 0, материал не теряется', async () => {
    await createMaterial(['дракон']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 0,
        materialCount: 1,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  it('тег только в датах занятий — остальные источники 0', async () => {
    const classId = await createClass();
    await createLesson(classId, ['начинающие']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'начинающие',
        lessonCount: 1,
        materialCount: 0,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  // ADR-0108/ADR-0116: тег ставят и у канала — без этой агрегации форма
  // подсказала бы только материалы и занятия, написание тега канала
  // разъехалось бы с остальными.
  it('тег только у канала школы — channelCount 1, у занятий и материалов нули', async () => {
    await createChannel(['дракон']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 0,
        materialCount: 0,
        channelCount: 1,
        examItemCount: 0,
      },
    ]);
  });

  // ADR-0027: личный канал ученика — не канал школы, тот же фильтр, что
  // ChannelsService.list; иначе сводка предложила бы тег, который на самом
  // деле относится к одному ученику.
  it('личный канал ученика (broadcastEligible: false) в счёт не идёт, тег вовсе не появляется', async () => {
    await createChannel(['личный'], false);

    const result = await service.list({});

    expect(result).toEqual([]);
  });

  it('тег только у вопроса экзамена — у остальных источников нули', async () => {
    await createExamItem(['начинающие']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'начинающие',
        lessonCount: 0,
        materialCount: 0,
        channelCount: 0,
        examItemCount: 1,
      },
    ]);
  });

  it('тег встречается во всех источниках — каждый посчитан отдельно', async () => {
    const classId = await createClass();
    await createLesson(classId, ['дракон']);
    await createMaterial(['дракон']);
    await createChannel(['дракон']);
    await createExamItem(['дракон']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 1,
        materialCount: 1,
        channelCount: 1,
        examItemCount: 1,
      },
    ]);
  });

  it('тег в обеих коллекциях — оба источника посчитаны', async () => {
    const classId = await createClass();
    await createLesson(classId, ['дракон']);
    await createMaterial(['дракон']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 1,
        materialCount: 1,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  // ADR-0072: дата без своего тега наследует тег курса при подсчёте — иначе
  // у тега курса с тридцатью датами сводка показала бы ноль (ADR-0078
  // «Альтернативы»).
  it('наследование тега курса (ADR-0072): дата без своего тега считается по тегу курса', async () => {
    const classId = await createClass(['начинающие']);
    await createLesson(classId, []);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'начинающие',
        lessonCount: 1,
        materialCount: 0,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  // ADR-0078: свой тег даты совпадает с тегом курса — считается один раз,
  // не дважды ($setUnion схлопывает дубль до $group).
  it('дата и её курс с одним и тем же тегом — считается один раз, не дважды', async () => {
    const classId = await createClass(['дракон']);
    await createLesson(classId, ['дракон']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 1,
        materialCount: 0,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  it('две даты одного курса без своих тегов — обе считаются по тегу курса', async () => {
    const classId = await createClass(['дракон']);
    await createLesson(classId, []);
    await createLesson(classId, []);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 2,
        materialCount: 0,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  it('своя дата и тег курса разные — оба тега в сводке, без смешивания (ADR-0072)', async () => {
    const classId = await createClass(['начинающие']);
    await createLesson(classId, ['дракон']);

    const result = await service.list({});

    expect(result).toEqual(
      expect.arrayContaining([
        {
          tag: 'начинающие',
          lessonCount: 1,
          materialCount: 0,
          channelCount: 0,
          examItemCount: 0,
        },
        {
          tag: 'дракон',
          lessonCount: 1,
          materialCount: 0,
          channelCount: 0,
          examItemCount: 0,
        },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('нормализация уже применена при записи — одинаковые строки группируются в одну сводку', async () => {
    await createMaterial(['Дракон']);
    await createMaterial(['Дракон']);

    const result = await service.list({});

    expect(result).toEqual([
      {
        tag: 'Дракон',
        lessonCount: 0,
        materialCount: 2,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  it('лимит режет наименее используемые теги, не первые по алфавиту', async () => {
    await createMaterial(['частый']);
    await createMaterial(['частый']);
    await createMaterial(['частый']);
    await createMaterial(['редкий']);

    const result = await service.list({ limit: 1 });

    expect(result).toEqual([
      {
        tag: 'частый',
        lessonCount: 0,
        materialCount: 3,
        channelCount: 0,
        examItemCount: 0,
      },
    ]);
  });

  // Сортировка по суммарной использованности (все четыре источника), не по
  // одному из них: тег с одним материалом и одним вопросом экзамена (сумма
  // 2) обгоняет тег с одним материалом (сумма 1).
  it('сортировка учитывает сумму по всем четырём источникам', async () => {
    await createMaterial(['редкий']);
    await createMaterial(['частый']);
    await createExamItem(['частый']);

    const result = await service.list({});

    expect(result.map((row) => row.tag)).toEqual(['частый', 'редкий']);
  });
});
