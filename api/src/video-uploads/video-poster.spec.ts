// Кадр-превью видео (ADR-0165): разбор тела complete без Mongo и запись/чтение
// на настоящей Mongo, на своей тестовой модели-наследнике — ядро не знает ни
// ученика, ни вопроса. Что complete с кадром делает у каждого вида видео —
// answer-video-complete.spec.ts и exam-video-uploads.service.spec.ts.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { SchemaTypes, Types } from 'mongoose';
import {
  VIDEO_POSTER_LIMITS,
  VIDEO_POSTER_NOT_JPEG_MESSAGE,
  VIDEO_POSTER_TOO_LARGE_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { parseVideoPoster, readPoster, setPosterIfAbsent } from './video-poster';
import { VideoUploadRecord } from './video-upload.schema';

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const jpeg = (size = 32): Buffer =>
  Buffer.concat([Buffer.from(JPEG_HEAD), Buffer.alloc(size - JPEG_HEAD.length, 7)]);

describe('parseVideoPoster', () => {
  it('нет кадра — undefined: видео завершается без него', () => {
    expect(parseVideoPoster(undefined)).toBeUndefined();
  });

  it('JPEG в base64 — те же байты', () => {
    const bytes = jpeg();

    expect(parseVideoPoster(bytes.toString('base64'))).toEqual(bytes);
  });

  it('ровно потолок в 150 КБ проходит, на байт больше — отказ с текстом про размер', () => {
    expect(
      parseVideoPoster(jpeg(VIDEO_POSTER_LIMITS.maxBytes).toString('base64')),
    ).toHaveLength(VIDEO_POSTER_LIMITS.maxBytes);

    const tooBig = jpeg(VIDEO_POSTER_LIMITS.maxBytes + 1).toString('base64');
    expect(() => parseVideoPoster(tooBig)).toThrow(InvalidInputError);
    expect(() => parseVideoPoster(tooBig)).toThrow(VIDEO_POSTER_TOO_LARGE_MESSAGE);
  });

  it('PNG под видом кадра — отказ: тип решают первые байты, не заявление клиента', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

    expect(() => parseVideoPoster(png.toString('base64'))).toThrow(
      VIDEO_POSTER_NOT_JPEG_MESSAGE,
    );
  });

  it.each([
    ['пустая строка', ''],
    ['не base64 вовсе', '!!! не картинка !!!'],
    ['слишком короткий JPEG-заголовок', Buffer.from([0xff, 0xd8]).toString('base64')],
  ])('%s — отказ с текстом про JPEG', (_name, value) => {
    expect(() => parseVideoPoster(value)).toThrow(InvalidInputError);
    expect(() => parseVideoPoster(value)).toThrow(VIDEO_POSTER_NOT_JPEG_MESSAGE);
  });

  it('потолок base64 в DTO согласован с потолком байтов: на границе одно и то же', () => {
    const atCap = jpeg(VIDEO_POSTER_LIMITS.maxBytes).toString('base64');

    expect(atCap.length).toBeLessThanOrEqual(VIDEO_POSTER_LIMITS.maxBase64Length);
    expect(
      jpeg(VIDEO_POSTER_LIMITS.maxBytes + 3).toString('base64').length,
    ).toBeGreaterThan(VIDEO_POSTER_LIMITS.maxBase64Length);
  });
});

@Schema({ timestamps: true, collection: 'zz_test_poster_clips' })
class PosterClipRecord extends VideoUploadRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  ownerId!: Types.ObjectId;
}
const PosterClipSchema = SchemaFactory.createForClass(PosterClipRecord);

describe('кадр-превью в записи (настоящая Mongo)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<PosterClipRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<PosterClipRecord>('PosterClipRecord', PosterClipSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function seed(poster?: Buffer): Promise<string> {
    const doc = await model.create({
      ownerId: new Types.ObjectId(),
      key: 'test-clips/k',
      sizeBytes: 10,
      fingerprint: 'f',
      ...(poster ? { poster } : {}),
    });
    return doc._id.toString();
  }

  it('select: false — ни обычное чтение, ни список, ни выборка с проекцией кадр не несут', async () => {
    const id = await seed(jpeg());

    const single = await model.findById(id).lean();
    const list = await model.find({}).lean();
    const projected = await model.find({}, { _id: 1, key: 1 }).lean();

    expect(single).not.toHaveProperty('poster');
    expect(list[0]).not.toHaveProperty('poster');
    expect(projected[0]).not.toHaveProperty('poster');
  });

  it('create не возвращает кадр с чтением следом: запись после создания читается без него', async () => {
    const id = await seed(jpeg());

    expect(await model.findById(id).lean()).not.toHaveProperty('poster');
  });

  it('+poster — кадр читается, и readPoster отдаёт те же байты (read-after-write)', async () => {
    const bytes = jpeg(64);
    const id = await seed(bytes);

    const doc = await model.findById(id, '+poster').lean();

    expect(doc && readPoster(doc)).toEqual(bytes);
  });

  it('readPoster: нет кадра — null', async () => {
    const id = await seed();

    const doc = await model.findById(id, '+poster').lean();

    expect(doc && readPoster(doc)).toBeNull();
  });

  describe('setPosterIfAbsent', () => {
    it('кадра нет — ставится', async () => {
      const id = await seed();
      const bytes = jpeg(48);

      await setPosterIfAbsent(model, id, bytes);

      const doc = await model.findById(id, '+poster').lean();
      expect(doc && readPoster(doc)).toEqual(bytes);
    });

    it('кадр уже стоит — первый не перетирается, повтор идемпотентен', async () => {
      const first = jpeg(48);
      const id = await seed(first);

      await setPosterIfAbsent(model, id, jpeg(64));
      await setPosterIfAbsent(model, id, first);

      const doc = await model.findById(id, '+poster').lean();
      expect(doc && readPoster(doc)).toEqual(first);
    });

    it('кадра в теле не было — ничего не пишет', async () => {
      const id = await seed();

      await setPosterIfAbsent(model, id, undefined);

      const doc = await model.findById(id, '+poster').lean();
      expect(doc && readPoster(doc)).toBeNull();
    });
  });
});
