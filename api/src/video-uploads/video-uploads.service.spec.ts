// Ядро загрузки видео частями на настоящей Mongo, на СВОЕЙ тестовой модели, а не на
// видео-ответе (ADR-0165): так видно, что ядро не знает ни ученика, ни попытки, и
// следующий вид видео подключается схемой-наследником и тремя вызовами. Путь
// видео-ответа целиком — answer-videos.flow.spec.ts.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ConflictError } from '../common/errors';
import type { FileStoreService } from '../storage/file-store.service';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { assertAllPartsReceived } from './video-upload-assemble';
import type { RawLeanVideoUpload } from './video-upload.mapper';
import { VideoUploadRecord } from './video-upload.schema';
import { VideoUploadsService } from './video-uploads.service';

// «Клип штата»: один свой признак вместо ученика/попытки/вопроса.
@Schema({ timestamps: true, collection: 'zz_test_clips' })
class TestClipRecord extends VideoUploadRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  ownerId!: Types.ObjectId;
}
const TestClipSchema = SchemaFactory.createForClass(TestClipRecord);

const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);
const SIZE_BYTES = 20;
const MP4_PART = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(SIZE_BYTES - 12),
]);

describe('VideoUploadsService на тестовой модели', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<TestClipRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let multipart: Record<string, jest.Mock>;
  let uploads: VideoUploadsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<TestClipRecord>('TestClipRecord', TestClipSchema);
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    multipart = {
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      uploadPart: jest.fn().mockResolvedValue('"etag-1"'),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    };
    const orphans = new StorageOrphansService(orphanModel, {
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService);
    uploads = new VideoUploadsService(
      multipart as unknown as MultipartStoreService,
      {} as ObjectHeadService,
      orphans,
    );
  });

  afterEach(async () => {
    await Promise.all([model.deleteMany({}), orphanModel.deleteMany({})]);
  });

  const owner = new Types.ObjectId();

  function begin(
    existing: RawLeanVideoUpload | null,
    fingerprint = 'f1',
  ): ReturnType<VideoUploadsService['start']> {
    return uploads.start(model, {
      existing,
      sizeBytes: SIZE_BYTES,
      fingerprint,
      keyPrefix: 'test-clips',
      create: (state) => model.create({ ownerId: owner, ...state }),
      now: NOW,
    });
  }

  type LeanClip = RawLeanVideoUpload & { ownerId: Types.ObjectId };

  async function lean(id: string): Promise<LeanClip> {
    const doc = await model.findById(id).lean<LeanClip>();
    if (!doc) throw new Error(`тестовая запись ${id} не найдена`);
    return doc;
  }

  it('старт → часть → сборка: ключ в своём каталоге, часть принята, метка R2 стоит', async () => {
    const started = await begin(null);
    const doc = await lean(started.id);
    expect(doc.key).toMatch(/^test-clips\/[0-9a-f-]{36}$/);
    expect(await orphanModel.countDocuments({ key: doc.key })).toBe(1);

    const afterPart = await uploads.uploadPart(model, {
      doc,
      partNumber: 1,
      body: MP4_PART,
      now: NOW,
    });
    expect(afterPart.receivedParts).toEqual([1]);

    const withPart = await lean(started.id);
    assertAllPartsReceived(withPart);
    await uploads.assemble(model, withPart, 'upload-1', NOW);

    const assembled = await lean(started.id);
    expect(assembled.r2CompletedAt).toBeInstanceOf(Date);
    expect(multipart.completeMultipartUpload).toHaveBeenCalledTimes(1);
    expect(await orphanModel.countDocuments({ key: doc.key })).toBe(0);
  });

  it('тот же отпечаток — resume с принятыми частями, другой — прежняя убрана и начата новая', async () => {
    const first = await begin(null, 'f1');
    const resumed = await begin(await lean(first.id), 'f1');
    expect(resumed.id).toBe(first.id);

    await model.updateOne({ _id: first.id }, { $set: { uploadId: 'stale-upload' } });
    const replaced = await begin(await lean(first.id), 'f2');

    expect(replaced.id).not.toBe(first.id);
    expect(multipart.abortMultipartUpload).toHaveBeenCalledWith(
      expect.any(String),
      'stale-upload',
      NOW,
    );
    expect(await model.countDocuments({})).toBe(1);
  });

  it('не все части — ConflictError до сборки', () => {
    const noParts: RawLeanVideoUpload = {
      _id: new Types.ObjectId(),
      key: 'test-clips/x',
      sizeBytes: SIZE_BYTES,
      fingerprint: 'f',
      status: 'uploading',
      parts: [],
      createdAt: NOW.toJSDate(),
      updatedAt: NOW.toJSDate(),
    };

    expect(() => assertAllPartsReceived(noParts)).toThrow(ConflictError);
  });

  it('уборщик убирает брошенное старше срока и не трогает свежее и готовое', async () => {
    const stale = await model.create({
      ownerId: owner,
      key: 'test-clips/stale',
      sizeBytes: SIZE_BYTES,
      fingerprint: 'a',
      uploadId: 'upload-stale',
    });
    const fresh = await model.create({
      ownerId: owner,
      key: 'test-clips/fresh',
      sizeBytes: SIZE_BYTES,
      fingerprint: 'b',
    });
    const ready = await model.create({
      ownerId: owner,
      key: 'test-clips/ready',
      sizeBytes: SIZE_BYTES,
      fingerprint: 'c',
      status: 'ready',
    });
    const longAgo = NOW.minus({ days: 10 }).toJSDate();
    await model.collection.updateMany(
      { _id: { $in: [stale._id, ready._id] } },
      { $set: { updatedAt: longAgo } },
    );

    const removed = await uploads.sweepStale(model, {
      olderThanDays: 7,
      limit: 50,
      now: NOW,
    });

    expect(removed).toBe(1);
    expect(multipart.abortMultipartUpload).toHaveBeenCalledWith(
      'test-clips/stale',
      'upload-stale',
      NOW,
    );
    expect(await model.countDocuments({ _id: stale._id })).toBe(0);
    expect(await model.countDocuments({ _id: { $in: [fresh._id, ready._id] } })).toBe(2);
  });
});
