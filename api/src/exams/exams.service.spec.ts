// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): шифрование содержательных полей, правила блоков ТЗ 4.3 (п.1–5),
// фильтры и лимит списка, id блока сохраняется при правке.
import type { Connection, Model } from 'mongoose';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const CREATED_BY = '507f1f77bcf86cd799439011';

describe('ExamsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ExamRecord>;
  let itemModel: Model<ExamItemRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let service: ExamsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ExamRecord>(ExamRecord.name, ExamSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    service = new ExamsService(model, itemModel, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await itemModel.deleteMany({});
    await attemptModel.deleteMany({});
  });

  // Минимальный вопрос банка для ссылки из блока — тест самих правил формы,
  // содержимое вопроса шифрованием ExamsService не затрагивается (сервис
  // читает у вопроса только _id/status, см. assertItemsEligible).
  async function createItem(status: 'draft' | 'published' | 'archived') {
    const doc = await itemModel.create({ kind: 'text', prompt: 'вопрос', status });
    return doc._id.toString();
  }

  it('create → getById: read-after-write, title/description расшифрованы в ответе', async () => {
    const created = await service.create(
      { title: 'Экзамен по форме', description: 'Первый уровень' },
      CREATED_BY,
    );

    // .findById().lean() без decryptRecord — сырая база, без сервиса.
    const raw = await model.findById(created.id).lean();
    expect(raw?.title).not.toBe('Экзамен по форме');

    const found = await service.getById(created.id);
    expect(found.title).toBe('Экзамен по форме');
    expect(found.description).toBe('Первый уровень');
    expect(found.status).toBe('draft');
    expect(found.attemptsAllowed).toBe(1);
    expect(found.createdBy).toBe(CREATED_BY);
    expect(found.blocks).toEqual([]);
  });

  it('создаётся без автора (CLI-импорт сида) — createdBy не пишется в документ', async () => {
    const created = await service.create({ title: 'Экзамен без автора' });

    expect(created.createdBy).toBeUndefined();
    const raw = await model.findById(created.id).lean();
    expect(raw?.createdBy).toBeUndefined();
  });

  it('блок ссылается на опубликованный вопрос — создаётся, id блока и вариантов — строки', async () => {
    const itemId = await createItem('published');

    const created = await service.create(
      { title: 'Экзамен', blocks: [{ title: 'Теория', itemIds: [itemId] }] },
      CREATED_BY,
    );

    expect(created.blocks).toHaveLength(1);
    expect(created.blocks[0]?.itemIds).toEqual([itemId]);
    expect(typeof created.blocks[0]?.id).toBe('string');
  });

  it('блок ссылается на черновой вопрос — InvalidInputError, форма не создаётся', async () => {
    const draftItemId = await createItem('draft');

    await expect(
      service.create(
        { title: 'Экзамен', blocks: [{ itemIds: [draftItemId] }] },
        CREATED_BY,
      ),
    ).rejects.toThrow('не из опубликованных');
    await expect(model.countDocuments({})).resolves.toBe(0);
  });

  it('блок ссылается на архивный вопрос — InvalidInputError', async () => {
    const archivedItemId = await createItem('archived');

    await expect(
      service.create(
        { title: 'Экзамен', blocks: [{ itemIds: [archivedItemId] }] },
        CREATED_BY,
      ),
    ).rejects.toThrow('не из опубликованных');
  });

  it('блок ссылается на чужой/удалённый id — InvalidInputError', async () => {
    const foreignId = '507f1f77bcf86cd799439099';

    await expect(
      service.create(
        { title: 'Экзамен', blocks: [{ itemIds: [foreignId] }] },
        CREATED_BY,
      ),
    ).rejects.toThrow('не из опубликованных');
  });

  it('один и тот же вопрос повторяется в разных блоках — InvalidInputError', async () => {
    const itemId = await createItem('published');

    await expect(
      service.create(
        {
          title: 'Экзамен',
          blocks: [{ itemIds: [itemId] }, { itemIds: [itemId] }],
        },
        CREATED_BY,
      ),
    ).rejects.toThrow('повторяется');
  });

  it('публикация пустой формы (блоков нет) — InvalidInputError', async () => {
    const created = await service.create({ title: 'Экзамен' }, CREATED_BY);

    await expect(service.update(created.id, { status: 'published' })).rejects.toThrow(
      'нет ни одного вопроса',
    );
  });

  it('публикация формы с блоком без вопросов — InvalidInputError', async () => {
    const created = await service.create(
      { title: 'Экзамен', blocks: [{ title: 'Пустой блок', itemIds: [] }] },
      CREATED_BY,
    );

    await expect(service.update(created.id, { status: 'published' })).rejects.toThrow(
      'нет ни одного вопроса',
    );
  });

  it('публикация формы с опубликованным вопросом — 200, статус published', async () => {
    const itemId = await createItem('published');
    const created = await service.create(
      { title: 'Экзамен', blocks: [{ itemIds: [itemId] }] },
      CREATED_BY,
    );

    const published = await service.update(created.id, { status: 'published' });

    expect(published.status).toBe('published');
  });

  // Учитель собирает экзамен в боте (ТЗ 4б.4, docs/PLAN.md §12) — тот же
  // переход в published одним вызовом, что и create()+update() в кабинете.
  it('createAndPublishExam — создаёт и публикует одним вызовом', async () => {
    const itemId = await createItem('published');

    const exam = await service.createAndPublishExam(
      { title: 'Экзамен из бота', blocks: [{ itemIds: [itemId] }] },
      CREATED_BY,
    );

    expect(exam.status).toBe('published');
    const found = await service.getById(exam.id);
    expect(found.status).toBe('published');
    expect(found.blocks[0]?.itemIds).toEqual([itemId]);
  });

  // В боте кнопка «Собрать (k)» недоступна без отмеченного вопроса (ТЗ 4б.4) —
  // этот путь недостижим из диалога, но правило живёт в сервисе, а не в
  // хендлере (ADR-0024): пустой список всё равно получает отказ публикации.
  it('createAndPublishExam без вопросов — InvalidInputError, публикация не проходит', async () => {
    await expect(
      service.createAndPublishExam({ title: 'Пустой экзамен' }, CREATED_BY),
    ).rejects.toThrow('нет ни одного вопроса');
    const exams = await service.list({});
    expect(exams).toHaveLength(1);
    expect(exams[0]?.status).toBe('draft');
  });

  // Блокер аудита 2026-09-15 №3: «хотя бы один вопрос» раньше проверялся
  // только на переходе в published — уже опубликованную форму можно было
  // сохранить пустой без единого перехода статуса.
  it('сохранение уже опубликованной формы без вопросов — InvalidInputError, форма не меняется', async () => {
    const itemId = await createItem('published');
    const created = await service.create(
      { title: 'Экзамен', blocks: [{ itemIds: [itemId] }] },
      CREATED_BY,
    );
    await service.update(created.id, { status: 'published' });

    await expect(service.update(created.id, { blocks: [] })).rejects.toThrow(
      'нет ни одного вопроса',
    );
    const stillThere = await service.getById(created.id);
    expect(stillThere.status).toBe('published');
    expect(stillThere.blocks[0]?.itemIds).toEqual([itemId]);
  });

  it('черновик без вопросов сохраняется — законно, это не публикация', async () => {
    const created = await service.create({ title: 'Экзамен' }, CREATED_BY);

    const updated = await service.update(created.id, { title: 'Экзамен (правка)' });

    expect(updated.status).toBe('draft');
    expect(updated.blocks).toEqual([]);
  });

  it('удаление черновика — проходит', async () => {
    const created = await service.create({ title: 'Экзамен' }, CREATED_BY);

    await service.remove(created.id);

    await expect(model.findById(created.id)).resolves.toBeNull();
  });

  it('удаление опубликованной формы — ConflictError, форма остаётся', async () => {
    const itemId = await createItem('published');
    const created = await service.create(
      { title: 'Экзамен', blocks: [{ itemIds: [itemId] }] },
      CREATED_BY,
    );
    await service.update(created.id, { status: 'published' });

    await expect(service.remove(created.id)).rejects.toThrow(
      'Удалить можно только черновик',
    );
    await expect(model.findById(created.id)).resolves.not.toBeNull();
  });

  // Пункт 4 аудита 2026-09-15: та же дыра, что у вопроса банка, но для самой
  // формы — переход published → draft ничем не ограничен (в отличие от
  // published-инварианта выше), и форму, по которой уже сдавали, можно было
  // откатить в черновик и удалить, осиротив exam_attempts.
  it('форма с попыткой ученика — не удаляется, даже откатившись в черновик', async () => {
    const itemId = await createItem('published');
    const created = await service.create(
      { title: 'Экзамен', blocks: [{ itemIds: [itemId] }] },
      CREATED_BY,
    );
    await service.update(created.id, { status: 'published' });
    await attemptModel.create({
      examId: created.id,
      examTitle: created.title,
      userId: CREATED_BY,
      attemptNo: 1,
      startedAt: new Date(),
    });
    // Учитель откатил форму назад в черновик — старый removeIfDraft этого
    // не видел и дал бы удалить (блокер №4).
    await service.update(created.id, { status: 'draft', blocks: [] });

    await expect(service.remove(created.id)).rejects.toThrow('уже есть попытки учеников');
    await expect(model.findById(created.id)).resolves.not.toBeNull();
  });

  it('id блока сохраняется при правке, у нового блока — новый id', async () => {
    const itemId = await createItem('published');
    const created = await service.create(
      { title: 'Экзамен', blocks: [{ title: 'Первый', itemIds: [itemId] }] },
      CREATED_BY,
    );
    const existingBlockId = created.blocks[0]?.id;

    const updated = await service.update(created.id, {
      blocks: [
        { id: existingBlockId, title: 'Первый (правка)', itemIds: [itemId] },
        { title: 'Второй', itemIds: [] },
      ],
    });

    expect(updated.blocks[0]?.id).toBe(existingBlockId);
    expect(updated.blocks[0]?.title).toBe('Первый (правка)');
    expect(updated.blocks[1]?.id).not.toBe(existingBlockId);
  });

  it('createdBy не меняется при правке', async () => {
    const created = await service.create({ title: 'Экзамен' }, CREATED_BY);

    const updated = await service.update(created.id, { title: 'Экзамен (правка)' });

    expect(updated.createdBy).toBe(CREATED_BY);
  });

  it('список: фильтр по status и level, лимит', async () => {
    await service.create({ title: 'Черновик', level: 'начальный' }, CREATED_BY);
    const published = await service.create(
      { title: 'В архиве', level: 'высший' },
      CREATED_BY,
    );
    await service.update(published.id, { status: 'archived' });

    const byStatus = await service.list({ status: 'archived' });
    expect(byStatus.map((exam) => exam.title)).toEqual(['В архиве']);

    const byLevel = await service.list({ level: 'начальный' });
    expect(byLevel.map((exam) => exam.title)).toEqual(['Черновик']);

    const limited = await service.list({ limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it('getById с несуществующим id — NotFoundError', async () => {
    const missingId = '507f1f77bcf86cd799439099';

    await expect(service.getById(missingId)).rejects.toThrow('Экзамен не найден');
  });

  it('update с несуществующим id — NotFoundError', async () => {
    const missingId = '507f1f77bcf86cd799439099';

    await expect(service.update(missingId, { title: 'x' })).rejects.toThrow(
      'Экзамен не найден',
    );
  });

  it('PATCH { level: null, description: null } — сброс к пустой строке', async () => {
    const created = await service.create(
      { title: 'Экзамен', level: 'начальный', description: 'описание' },
      CREATED_BY,
    );

    const updated = await service.update(created.id, { level: null, description: null });

    expect(updated.level).toBe('');
    expect(updated.description).toBe('');
  });
});
