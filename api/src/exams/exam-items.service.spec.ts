// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): шифрование содержательных полей, версии опубликованных вопросов
// (ТЗ 4.2, п.3), запрет удаления не-черновика.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { EXAM_IMAGE_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const AUTHOR_ID = '507f1f77bcf86cd799439011';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('ExamItemsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ExamItemRecord>;
  let examModel: Model<ExamRecord>;
  let imageModel: Model<ExamImageRecord>;
  let service: ExamItemsService;
  let examsService: ExamsService;
  let examImagesService: ExamImagesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    examModel = connection.model<ExamRecord>(ExamRecord.name, ExamSchema);
    const attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name, ExamImageSchema);
    examImagesService = new ExamImagesService(imageModel, attemptModel);
    service = new ExamItemsService(model, examModel, examImagesService);
    // Только чтобы завести реальный неархивированный экзамен, ссылающийся на
    // вопрос (защита от удаления/архивации, exam-item-references.ts) — без
    // отдельного мока формы, тем же приёмом, что exam-item-stats.service.spec.ts.
    examsService = new ExamsService(examModel, model, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await examModel.deleteMany({});
    await imageModel.deleteMany({});
  });

  async function uploadImage(): Promise<string> {
    const dto = await examImagesService.upload(JPEG, AUTHOR_ID);
    return dto.id;
  }

  /** Сырой документ мимо сервиса — единственный способ увидеть, что реально
   * лежит в imageIds (сравнение через String(), т.к. это ObjectId). */
  async function rawImageIds(id: string): Promise<string[]> {
    const raw = await model.collection.findOne<{ imageIds?: unknown[] }>({
      _id: new Types.ObjectId(id),
    });
    return (raw?.imageIds ?? []).map((v) => String(v));
  }

  it('create → getById: read-after-write, prompt расшифрован в ответе', async () => {
    const created = await service.create(
      { kind: 'text', prompt: 'Опишите форму «пэнбу»' },
      AUTHOR_ID,
    );

    // .findById().lean() без decryptRecord — сырая база, без сервиса.
    const raw = await model.findById(created.id).lean();
    expect(raw?.prompt).not.toBe('Опишите форму «пэнбу»');

    const found = await service.getById(created.id);
    expect(found.prompt).toBe('Опишите форму «пэнбу»');
    expect(found.authorId).toBe(AUTHOR_ID);
    // ADR-0033: новый вопрос сразу годен к сборке формы, отдельного шага
    // «опубликовать» больше нет.
    expect(found.status).toBe('published');
    expect(found.version).toBe(1);
    expect(found.history).toEqual([]);
  });

  it('создаётся без автора (CLI-импорт сида) — authorId не пишется в документ', async () => {
    const created = await service.create({ kind: 'text', prompt: 'Вопрос без автора' });

    expect(created.authorId).toBeUndefined();
    const raw = await model.findById(created.id).lean();
    expect(raw?.authorId).toBeUndefined();
  });

  it('status: draft при создании — вопрос остаётся спрятанным (ADR-0033)', async () => {
    const created = await service.create(
      { kind: 'text', prompt: 'Пока прячу', status: 'draft' },
      AUTHOR_ID,
    );

    await expect(service.getById(created.id)).resolves.toMatchObject({
      status: 'draft',
    });
  });

  it('single с двумя вариантами и одним верным — options в ответе с id', async () => {
    const created = await service.create(
      {
        kind: 'single',
        prompt: 'Сколько уровней в форме?',
        options: [
          { text: '5', correct: false },
          { text: '8', correct: true },
        ],
      },
      AUTHOR_ID,
    );

    expect(created.options).toHaveLength(2);
    expect(
      created.options.every((o) => typeof o.id === 'string' && o.id.length > 0),
    ).toBe(true);
    expect(created.options.filter((o) => o.correct)).toHaveLength(1);
  });

  it('single с одним вариантом — InvalidInputError, вопрос не создаётся', async () => {
    await expect(
      service.create(
        { kind: 'single', prompt: 'x', options: [{ text: 'A', correct: true }] },
        AUTHOR_ID,
      ),
    ).rejects.toThrow('Укажите от 2 до 10');
    await expect(model.countDocuments({})).resolves.toBe(0);
  });

  it('text с вариантами — InvalidInputError', async () => {
    await expect(
      service.create({ kind: 'text', prompt: 'x', options: [{ text: 'A' }] }, AUTHOR_ID),
    ).rejects.toThrow('не бывает вариантов ответа');
  });

  it('multiple без отмеченных верных — InvalidInputError', async () => {
    await expect(
      service.create(
        {
          kind: 'multiple',
          prompt: 'x',
          options: [{ text: 'A' }, { text: 'B' }],
        },
        AUTHOR_ID,
      ),
    ).rejects.toThrow('хотя бы один правильный вариант');
  });

  describe('картинки вариантов (ADR-0035)', () => {
    it('create с imageId несуществующей картинки — InvalidInputError, вопрос не создаётся', async () => {
      await expect(
        service.create(
          {
            kind: 'single',
            prompt: 'p',
            options: [
              { imageId: new Types.ObjectId().toString(), correct: true },
              { text: 'B', correct: false },
            ],
          },
          AUTHOR_ID,
        ),
      ).rejects.toThrow(EXAM_IMAGE_NOT_FOUND_MESSAGE);
      await expect(model.countDocuments({})).resolves.toBe(0);
    });

    it('create с реальной картинкой — imageId в DTO варианта, imageIds сырого документа содержит её', async () => {
      const imageId = await uploadImage();

      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { imageId, correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );

      expect(created.options[0]?.imageId).toBe(imageId);
      expect(created.options[0]?.text).toBe('');
      await expect(rawImageIds(created.id)).resolves.toEqual([imageId]);
    });

    it('update, заменивший картинку у опубликованного вопроса — version+1, imageIds содержит обе (старая — в history)', async () => {
      const oldImageId = await uploadImage();
      const newImageId = await uploadImage();
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { imageId: oldImageId, correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );
      await service.update(created.id, { status: 'published' }, NOW);

      const updated = await service.update(
        created.id,
        {
          options: [
            { imageId: newImageId, correct: true },
            { text: 'B', correct: false },
          ],
        },
        NOW,
      );

      expect(updated.version).toBe(2);
      expect(updated.options[0]?.imageId).toBe(newImageId);
      expect(updated.history[0]?.options[0]?.imageId).toBe(oldImageId);
      const raw = await rawImageIds(created.id);
      expect(raw.sort()).toEqual([oldImageId, newImageId].sort());
    });

    it('update без options — imageIds не теряется (поле выравнивается на каждой правке)', async () => {
      const imageId = await uploadImage();
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { imageId, correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );

      await service.update(created.id, { prompt: 'Уточнённая формулировка' }, NOW);

      await expect(rawImageIds(created.id)).resolves.toEqual([imageId]);
    });
  });

  describe('версии опубликованного вопроса (ТЗ 4.2, п.3)', () => {
    it('правка prompt у черновика — version не растёт, history пуст', async () => {
      const created = await service.create(
        { kind: 'text', prompt: 'Черновик', status: 'draft' },
        AUTHOR_ID,
      );

      const updated = await service.update(
        created.id,
        { prompt: 'Черновик, версия 2' },
        NOW,
      );

      expect(updated.version).toBe(1);
      expect(updated.history).toEqual([]);
      expect(updated.prompt).toBe('Черновик, версия 2');
    });

    it('правка prompt у опубликованного — version 1 → 2, старая редакция в history', async () => {
      const created = await service.create(
        { kind: 'text', prompt: 'Старый текст' },
        AUTHOR_ID,
      );
      await service.update(created.id, { status: 'published' }, NOW);

      const updated = await service.update(created.id, { prompt: 'Новый текст' }, NOW);

      expect(updated.version).toBe(2);
      expect(updated.prompt).toBe('Новый текст');
      expect(updated.history).toHaveLength(1);
      expect(updated.history[0]).toMatchObject({ version: 1, prompt: 'Старый текст' });
      expect(updated.history[0]?.replacedAt).toBe(NOW.toUTC().toISO());
    });

    // Экран «Вопросы» шлёт все содержательные поля разом, поэтому «открыл,
    // ничего не тронул, сохранил» доходило до сервиса как правка и клало в
    // историю пустую запись (ревью 2026-09-12).
    it('сохранение без единой правки — version тот же, history пуст', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'Что делает поясница?',
          options: [
            { text: 'Расслабляется', correct: true },
            { text: 'Напрягается', correct: false },
          ],
        },
        AUTHOR_ID,
      );
      const published = await service.update(created.id, { status: 'published' }, NOW);

      const updated = await service.update(
        created.id,
        {
          prompt: published.prompt,
          options: published.options.map((option) => ({
            id: option.id,
            text: option.text,
            correct: option.correct,
          })),
        },
        NOW,
      );

      expect(updated.version).toBe(1);
      expect(updated.history).toEqual([]);
    });

    it('правка одного варианта у опубликованного — version растёт', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'Вопрос',
          options: [
            { text: 'Верный', correct: true },
            { text: 'Неверный', correct: false },
          ],
        },
        AUTHOR_ID,
      );
      const published = await service.update(created.id, { status: 'published' }, NOW);

      const updated = await service.update(
        created.id,
        {
          options: published.options.map((option, index) => ({
            id: option.id,
            text: index === 0 ? 'Верный, но иначе' : option.text,
            correct: option.correct,
          })),
        },
        NOW,
      );

      expect(updated.version).toBe(2);
      expect(updated.history[0]?.options[0]?.text).toBe('Верный');
    });

    it('вторая правка опубликованного — новая редакция первой в history', async () => {
      const created = await service.create({ kind: 'text', prompt: 'v1' }, AUTHOR_ID);
      await service.update(created.id, { status: 'published' }, NOW);
      await service.update(created.id, { prompt: 'v2' }, NOW);

      const updated = await service.update(
        created.id,
        { prompt: 'v3' },
        NOW.plus({ hours: 1 }),
      );

      expect(updated.version).toBe(3);
      expect(updated.history).toHaveLength(2);
      expect(updated.history[0]).toMatchObject({ version: 2, prompt: 'v2' });
      expect(updated.history[1]).toMatchObject({ version: 1, prompt: 'v1' });
    });

    it('смена только status у опубликованного — version не растёт', async () => {
      const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(created.id, { status: 'published' }, NOW);

      const updated = await service.update(created.id, { status: 'archived' }, NOW);

      expect(updated.version).toBe(1);
      expect(updated.history).toEqual([]);
      expect(updated.prompt).toBe(published.prompt);
    });

    it('правка options у опубликованного single — старые options в history с их id', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );
      const oldOptionIds = created.options.map((o) => o.id);
      await service.update(created.id, { status: 'published' }, NOW);

      const updated = await service.update(
        created.id,
        {
          options: [
            { text: 'C', correct: false },
            { text: 'D', correct: true },
          ],
        },
        NOW,
      );

      expect(updated.version).toBe(2);
      expect(updated.options.map((o) => o.text)).toEqual(['C', 'D']);
      expect(updated.history[0]?.options.map((o) => o.text)).toEqual(['A', 'B']);
      expect(updated.history[0]?.options.map((o) => o.id)).toEqual(oldOptionIds);
    });

    it('PATCH options с id существующего варианта — id сохраняется, текст меняется', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );
      const [first, second] = created.options;
      if (!first || !second) throw new Error('варианты не создались');

      const updated = await service.update(
        created.id,
        {
          options: [
            { id: first.id, text: 'A изменён', correct: true },
            { id: second.id, text: 'B', correct: false },
          ],
        },
        NOW,
      );

      expect(updated.options.map((o) => o.id)).toEqual([first.id, second.id]);
      expect(updated.options[0]?.text).toBe('A изменён');
    });

    it('PATCH options без id — новый вариант получает новый id, старый не переносится', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );
      const oldId = created.options[0]?.id;

      const updated = await service.update(
        created.id,
        {
          options: [
            { text: 'C', correct: true },
            { text: 'D', correct: false },
          ],
        },
        NOW,
      );

      expect(updated.options.map((o) => o.id)).not.toContain(oldId);
    });

    it('правка options без одного верного у single — InvalidInputError, вопрос не меняется', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );

      await expect(
        service.update(created.id, { options: [{ text: 'C' }, { text: 'D' }] }, NOW),
      ).rejects.toThrow('ровно один правильный вариант');
      await expect(service.getById(created.id)).resolves.toMatchObject({
        options: created.options,
      });
    });
  });

  describe('удаление — только черновик (ТЗ 4.2, п.4)', () => {
    it('черновик удаляется', async () => {
      const created = await service.create(
        { kind: 'text', prompt: 'p', status: 'draft' },
        AUTHOR_ID,
      );

      await service.remove(created.id);

      await expect(service.getById(created.id)).rejects.toThrow('Вопрос не найден');
    });

    it('опубликованный — ConflictError, вопрос остаётся', async () => {
      const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      await service.update(created.id, { status: 'published' }, NOW);

      await expect(service.remove(created.id)).rejects.toThrow(
        'Удалить можно только черновик',
      );
      await expect(service.getById(created.id)).resolves.toMatchObject({
        status: 'published',
      });
    });

    it('архивный — ConflictError', async () => {
      const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      await service.update(created.id, { status: 'published' }, NOW);
      await service.update(created.id, { status: 'archived' }, NOW);

      await expect(service.remove(created.id)).rejects.toThrow(
        'Удалить можно только черновик',
      );
    });

    it('несуществующий id — NotFoundError', async () => {
      await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
        'Вопрос не найден',
      );
    });
  });

  // Блокеры аудита 2026-09-15 №1 и №2: removeIfDraft/архивация проверяли
  // только статус самого вопроса, не ссылки из exams.blocks[].itemIds —
  // удаление или архивация вопроса, стоящего в неархивированном экзамене,
  // ломали форму для всех сдающих молча.
  describe('используется в экзамене (блокеры аудита 2026-09-15 №1 и №2)', () => {
    async function referencedDraftItem(): Promise<{
      itemId: string;
      examId: string;
      examTitle: string;
    }> {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      await service.update(item.id, { status: 'published' }, NOW);
      const exam = await examsService.create(
        { title: 'Итоговый экзамен', blocks: [{ itemIds: [item.id] }] },
        AUTHOR_ID,
      );
      // Учитель откатил вопрос назад в черновик, не убрав его из формы —
      // ровно случай, который старая removeIfDraft пропускала (блокер №1).
      await service.update(item.id, { status: 'draft' }, NOW);
      return { itemId: item.id, examId: exam.id, examTitle: exam.title };
    }

    it('черновик, стоящий в форме экзамена, — ConflictError с названием формы, вопрос остаётся', async () => {
      const { itemId, examTitle } = await referencedDraftItem();

      await expect(service.remove(itemId)).rejects.toThrow(`«${examTitle}»`);
      await expect(service.getById(itemId)).resolves.toMatchObject({ status: 'draft' });
    });

    it('опубликованный, стоящий в форме экзамена, — архивировать нельзя, названа форма', async () => {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(item.id, { status: 'published' }, NOW);
      const exam = await examsService.create(
        { title: 'Промежуточный экзамен', blocks: [{ itemIds: [published.id] }] },
        AUTHOR_ID,
      );

      await expect(
        service.update(published.id, { status: 'archived' }, NOW),
      ).rejects.toThrow(`«${exam.title}»`);
      await expect(service.getById(published.id)).resolves.toMatchObject({
        status: 'published',
      });
    });

    it('вопрос, который нигде не стоит, — удаляется как раньше', async () => {
      const item = await service.create(
        { kind: 'text', prompt: 'p', status: 'draft' },
        AUTHOR_ID,
      );

      await service.remove(item.id);

      await expect(service.getById(item.id)).rejects.toThrow('Вопрос не найден');
    });

    it('вопрос из архивированного экзамена — удаляется: архивная форма не в счёте', async () => {
      const { itemId, examId } = await referencedDraftItem();
      await examsService.update(examId, { status: 'archived' });

      await service.remove(itemId);

      await expect(service.getById(itemId)).rejects.toThrow('Вопрос не найден');
    });
  });

  describe('список', () => {
    it('фильтр по status', async () => {
      const draft = await service.create(
        { kind: 'text', prompt: 'Черновик', status: 'draft' },
        AUTHOR_ID,
      );
      await service.create({ kind: 'text', prompt: 'Опубликован' }, AUTHOR_ID);

      const list = await service.list({ status: 'draft' });

      expect(list.map((i) => i.id)).toEqual([draft.id]);
    });

    it('фильтр по kind', async () => {
      await service.create({ kind: 'text', prompt: 'Текстовый' }, AUTHOR_ID);
      const video = await service.create({ kind: 'video', prompt: 'Видео' }, AUTHOR_ID);

      const list = await service.list({ kind: 'video' });

      expect(list.map((i) => i.id)).toEqual([video.id]);
    });

    it('лимит ограничивает количество результатов', async () => {
      await service.create({ kind: 'text', prompt: 'А' }, AUTHOR_ID);
      await service.create({ kind: 'text', prompt: 'Б' }, AUTHOR_ID);

      const list = await service.list({ limit: 1 });
      expect(list).toHaveLength(1);
    });
  });
});
