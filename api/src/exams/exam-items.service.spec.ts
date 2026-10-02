// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): шифрование содержательных полей, версии опубликованных вопросов
// (ТЗ 4.2, п.3), мягкое удаление в любом статусе (ADR-0140).
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import {
  EXAM_IMAGE_NOT_FOUND_MESSAGE,
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { fakeExamVideosService } from '../test-support/fake-exam-videos-service';

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
    service = new ExamItemsService(
      model,
      examModel,
      examImagesService,
      fakeExamVideosService(),
    );
    // Только чтобы завести реальный неархивированный экзамен, ссылающийся на
    // вопрос (защита от архивации, exam-item-references.ts) — без отдельного
    // мока формы, тем же приёмом, что exam-item-stats.service.spec.ts.
    examsService = new ExamsService(examModel, model);
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

  describe('видео вопроса и варианта (ADR-0133)', () => {
    it('create с videoId вопроса — попадает в DTO', async () => {
      const videoId = new Types.ObjectId().toString();

      const created = await service.create(
        { kind: 'text', prompt: 'Что не так на видео?', videoId },
        AUTHOR_ID,
      );

      expect(created.videoId).toBe(videoId);
    });

    it('create с videoUrl вопроса — попадает в DTO', async () => {
      const created = await service.create(
        {
          kind: 'text',
          prompt: 'Что не так на видео?',
          videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        },
        AUTHOR_ID,
      );

      expect(created.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    });

    it('create с videoId и videoUrl разом — InvalidInputError, вопрос не создаётся', async () => {
      await expect(
        service.create(
          {
            kind: 'text',
            prompt: 'p',
            videoId: new Types.ObjectId().toString(),
            videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          },
          AUTHOR_ID,
        ),
      ).rejects.toThrow('один источник видео');
      await expect(model.countDocuments({})).resolves.toBe(0);
    });

    it('update — добавили videoId вопросу без видео', async () => {
      const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const videoId = new Types.ObjectId().toString();

      const updated = await service.update(created.id, { videoId }, NOW);

      expect(updated.videoId).toBe(videoId);
    });

    it('update без videoId в теле — видео вопроса не меняется', async () => {
      const videoId = new Types.ObjectId().toString();
      const created = await service.create(
        { kind: 'text', prompt: 'p', videoId },
        AUTHOR_ID,
      );

      const updated = await service.update(created.id, { prompt: 'p2' }, NOW);

      expect(updated.videoId).toBe(videoId);
    });

    it('update с videoId: null — снимает видео вопроса', async () => {
      const videoId = new Types.ObjectId().toString();
      const created = await service.create(
        { kind: 'text', prompt: 'p', videoId },
        AUTHOR_ID,
      );

      const updated = await service.update(created.id, { videoId: null }, NOW);

      expect(updated.videoId).toBeUndefined();
    });

    it('update с videoUrl: null — снимает видео-ссылку вопроса', async () => {
      const created = await service.create(
        { kind: 'text', prompt: 'p', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
        AUTHOR_ID,
      );

      const updated = await service.update(created.id, { videoUrl: null }, NOW);

      expect(updated.videoUrl).toBeUndefined();
    });

    it('update, добавивший videoUrl поверх пустого videoId, — OK; поставить оба разом — InvalidInputError', async () => {
      const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);

      const updated = await service.update(
        created.id,
        { videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
        NOW,
      );
      expect(updated.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');

      await expect(
        service.update(created.id, { videoId: new Types.ObjectId().toString() }, NOW),
      ).rejects.toThrow('один источник видео');
    });

    it('create с videoId несуществующего видео — InvalidInputError (assertExist сервиса видео)', async () => {
      const failingVideos = fakeExamVideosService();
      (failingVideos.assertExist as jest.Mock).mockRejectedValue(
        new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE),
      );
      const withFailingVideos = new ExamItemsService(
        model,
        examModel,
        examImagesService,
        failingVideos,
      );

      await expect(
        withFailingVideos.create(
          { kind: 'text', prompt: 'p', videoId: new Types.ObjectId().toString() },
          AUTHOR_ID,
        ),
      ).rejects.toThrow(EXAM_VIDEO_NOT_FOUND_MESSAGE);
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

  // Мягкое удаление в любом статусе (ADR-0140) — новую машинерию отказов
  // покрывает exam-soft-delete.spec.ts, здесь только базовый переход этого
  // сервиса: удалить можно черновик/опубликованный/архивный, повторно — 404.
  describe('удаление (ADR-0140)', () => {
    it.each(['draft', 'published', 'archived'] as const)(
      'вопрос в статусе %s удаляется — пропадает из getById',
      async (status) => {
        const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
        if (status !== 'draft') await service.update(created.id, { status }, NOW);

        await service.remove(created.id, NOW);

        await expect(service.getById(created.id)).rejects.toThrow('Вопрос не найден');
      },
    );

    it('повторное удаление — NotFoundError', async () => {
      const created = await service.create(
        { kind: 'text', prompt: 'p', status: 'draft' },
        AUTHOR_ID,
      );
      await service.remove(created.id, NOW);

      await expect(service.remove(created.id, NOW)).rejects.toThrow('Вопрос не найден');
    });

    it('несуществующий id — NotFoundError', async () => {
      await expect(service.remove('507f1f77bcf86cd799439011', NOW)).rejects.toThrow(
        'Вопрос не найден',
      );
    });
  });

  // Блокер аудита 2026-09-15 №2 остаётся: архивация всё ещё рвёт ссылку,
  // если вопрос стоит в неархивированной и неудалённой форме (ADR-0140
  // снимает такую же защиту только у удаления, не у архивации).
  describe('используется в экзамене — архивация', () => {
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

    // Аудит 2026-10-01, F63: «Вернуть в черновик» у вопроса в живой форме
    // блокировал любое её сохранение (даже смену срока) — тот же механизм,
    // что у архивации, и тот же гейт.
    it('опубликованный, стоящий в форме, — вернуть в черновик нельзя, форма сохраняется дальше', async () => {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(item.id, { status: 'published' }, NOW);
      const exam = await examsService.create(
        { title: 'Экзамен в разгаре', blocks: [{ itemIds: [published.id] }] },
        AUTHOR_ID,
      );
      await examsService.update(exam.id, { status: 'published' });

      await expect(
        service.update(published.id, { status: 'draft' }, NOW),
      ).rejects.toThrow(`Вернуть в черновик нельзя`);
      await expect(
        service.update(published.id, { status: 'draft' }, NOW),
      ).rejects.toThrow(`«${exam.title}»`);
      await expect(service.getById(published.id)).resolves.toMatchObject({
        status: 'published',
      });
      // Read-after-write: форма по-прежнему сохраняется — ради этого и гейт.
      await expect(
        examsService.update(exam.id, { attemptsAllowed: 3 }),
      ).resolves.toMatchObject({ attemptsAllowed: 3 });
    });

    it('опубликованный, нигде не стоящий, — в черновик возвращается свободно', async () => {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(item.id, { status: 'published' }, NOW);

      await expect(
        service.update(published.id, { status: 'draft' }, NOW),
      ).resolves.toMatchObject({ status: 'draft' });
    });

    it('правка без смены статуса у вопроса в форме — проходит, гейт не трогает', async () => {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(item.id, { status: 'published' }, NOW);
      await examsService.create(
        { title: 'Форма с вопросом', blocks: [{ itemIds: [published.id] }] },
        AUTHOR_ID,
      );

      await expect(
        service.update(published.id, { prompt: 'p2', status: 'published' }, NOW),
      ).resolves.toMatchObject({ prompt: 'p2', status: 'published' });
    });

    it('форма удалена (ADR-0140) — архивация вопроса больше не заблокирована', async () => {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(item.id, { status: 'published' }, NOW);
      const exam = await examsService.create(
        { title: 'Форма для удаления', blocks: [{ itemIds: [published.id] }] },
        AUTHOR_ID,
      );
      await examsService.remove(exam.id, NOW);

      await expect(
        service.update(published.id, { status: 'archived' }, NOW),
      ).resolves.toMatchObject({ status: 'archived' });
    });

    it('вопрос удалён, но стоит в опубликованной форме — форму можно сохранить дальше', async () => {
      const item = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);
      const published = await service.update(item.id, { status: 'published' }, NOW);
      const exam = await examsService.create(
        { title: 'Живая форма', blocks: [{ itemIds: [published.id] }] },
        AUTHOR_ID,
      );
      await examsService.update(exam.id, { status: 'published' });

      await service.remove(published.id, NOW);

      await expect(
        examsService.update(exam.id, { level: 'начальный' }),
      ).resolves.toMatchObject({ level: 'начальный' });
      // includeDeleted — тем же приёмом, что exam-attempt-start.ts.
      await expect(service.getById(published.id, true)).resolves.toMatchObject({
        id: published.id,
      });
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

    it('удалённый вопрос по умолчанию отсутствует, с includeDeleted — виден с deletedAt', async () => {
      const live = await service.create({ kind: 'text', prompt: 'Живой' }, AUTHOR_ID);
      const removed = await service.create({ kind: 'text', prompt: 'Удалён' }, AUTHOR_ID);
      await service.remove(removed.id, NOW);

      const plain = await service.list({});
      expect(plain.map((i) => i.id)).toEqual([live.id]);

      const withDeleted = await service.list({ includeDeleted: true });
      expect(withDeleted.map((i) => i.id).sort()).toEqual([live.id, removed.id].sort());
      const deletedDto = withDeleted.find((i) => i.id === removed.id);
      expect(deletedDto?.deletedAt).toBe(NOW.toUTC().toISO());
    });
  });

  // ADR-0146: объяснение просят только у вопроса с выбором варианта.
  describe('askReason', () => {
    it('create с askReason у single — read-after-write: getById отдаёт askReason: true', async () => {
      const created = await service.create(
        {
          kind: 'single',
          prompt: 'p',
          askReason: true,
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        },
        AUTHOR_ID,
      );

      expect(created.askReason).toBe(true);
      await expect(service.getById(created.id)).resolves.toMatchObject({
        askReason: true,
      });
    });

    it('create без askReason — ключа в ответе нет', async () => {
      const created = await service.create({ kind: 'text', prompt: 'p' }, AUTHOR_ID);

      expect(created).not.toHaveProperty('askReason');
    });

    it('create с askReason у text — InvalidInputError, вопрос не создаётся', async () => {
      await expect(
        service.create({ kind: 'text', prompt: 'p', askReason: true }, AUTHOR_ID),
      ).rejects.toThrow('только у вопроса с выбором варианта');
      await expect(model.countDocuments({})).resolves.toBe(0);
    });

    it('update включает askReason у single — сохраняется, version растёт (содержательная правка)', async () => {
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

      const updated = await service.update(created.id, { askReason: true }, NOW);

      expect(updated.askReason).toBe(true);
      expect(updated.version).toBe(2);
    });

    it('update включает askReason у video — InvalidInputError, документ не меняется', async () => {
      const created = await service.create({ kind: 'video', prompt: 'p' }, AUTHOR_ID);

      await expect(service.update(created.id, { askReason: true }, NOW)).rejects.toThrow(
        'только у вопроса с выбором варианта',
      );
      await expect(service.getById(created.id)).resolves.not.toHaveProperty('askReason');
    });
  });
});
