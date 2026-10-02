// Схема видео-ответа после выноса общих полей в video-uploads/ (ADR-0165): та же
// коллекция, те же поля и те же индексы, что до выноса. Наследование схем в
// @nestjs/mongoose молча теряет поле, если у родителя нет `@Schema()` или его
// переименовали — здесь это видно сразу, а не на проде по пустому `uploadId`.
import { ANSWER_VIDEO_FIELD_POLICY, AnswerVideoSchema } from './answer-video.schema';

describe('AnswerVideoSchema', () => {
  it('собственные поля владения и общие поля загрузки на месте', () => {
    expect(Object.keys(AnswerVideoSchema.paths).sort()).toEqual(
      [
        '_id',
        'attemptId',
        'completedAt',
        'contentType',
        'createdAt',
        'fingerprint',
        'itemId',
        'key',
        'parts',
        'r2CompletedAt',
        'sizeBytes',
        'status',
        'updatedAt',
        'uploadId',
        'userId',
      ].sort(),
    );
  });

  it('обязательность, перечисления и значение по умолчанию как прежде', () => {
    const required = (path: string): boolean =>
      Boolean(AnswerVideoSchema.path(path).isRequired);
    for (const path of [
      'userId',
      'attemptId',
      'itemId',
      'key',
      'sizeBytes',
      'fingerprint',
      'status',
    ]) {
      expect(required(path)).toBe(true);
    }
    for (const path of ['contentType', 'uploadId', 'completedAt', 'r2CompletedAt']) {
      expect(required(path)).toBe(false);
    }
    expect(AnswerVideoSchema.path('status')).toMatchObject({
      enumValues: ['uploading', 'ready'],
      defaultValue: 'uploading',
    });
    expect(AnswerVideoSchema.path('contentType')).toMatchObject({
      enumValues: ['video/mp4', 'video/quicktime', 'video/webm'],
    });
  });

  it('часть — субдокумент без своего _id, номер и ETag обязательны', () => {
    const part = AnswerVideoSchema.path('parts') as unknown as {
      schema: {
        paths: Record<string, { isRequired?: boolean }>;
        options: { _id: boolean };
      };
    };

    expect(part.schema.options._id).toBe(false);
    expect(part.schema.paths.n?.isRequired).toBe(true);
    expect(part.schema.paths.etag?.isRequired).toBe(true);
  });

  it('индексы объявлены на схеме видео-ответа', () => {
    expect(AnswerVideoSchema.indexes().map(([keys]) => keys)).toEqual([
      { userId: 1 },
      { attemptId: 1, itemId: 1, status: 1 },
      { status: 1, updatedAt: 1 },
      { status: 1, completedAt: 1 },
    ]);
  });

  it('коллекция и метки времени как прежде', () => {
    expect(AnswerVideoSchema.get('collection')).toBe('answer_videos');
    expect(AnswerVideoSchema.get('timestamps')).toBe(true);
  });

  it('политика шифрования несёт решения для общих полей', () => {
    expect(Object.keys(ANSWER_VIDEO_FIELD_POLICY).sort()).toEqual(
      ['fingerprint', 'key', 'parts.etag', 'status', 'uploadId'].sort(),
    );
  });
});
