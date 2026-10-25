// Фикстуры e2e публичного расписания (ADR-0170): класс с Zoom, занятие с
// заданными `_id`/`startsAt`/`status`, пакет занятий и запрос по сырой
// query-строке (нужно, чтобы `+` в смещении кодировать как `%2B`, а не
// отдавать это supertest). Общие для public-lessons.e2e-spec.ts и
// public-lessons-validation.e2e-spec.ts — иначе блок дублировался бы (jscpd).
import { getModelToken } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { Types as MongooseTypes } from 'mongoose';
import request from 'supertest';
import type { LessonStatus } from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../../src/classes/class.schema';
import { LESSON_ENCRYPT_SCHEMA, LessonRecord } from '../../src/lessons/lesson.schema';
import { encryptRecord } from '../../src/utils/encryption';
import type { TestApp } from './create-app';

export const PUBLIC_LESSONS_PATH = '/api/public/lessons';
export const ZOOM_LINK = 'https://zoom.example/secret-room';
export const ZOOM_PASSWORD = 'секрет-класса';
export const ZOOM_OVERRIDE = 'https://zoom.example/once-only';

export interface NewPublicClass {
  title?: string;
  location?: string;
}

export interface NewPublicLesson {
  classId: Types.ObjectId;
  startsAt: string | Date;
  id?: string;
  status?: LessonStatus;
  topic?: string;
  tags?: string[];
  withZoomOverride?: boolean;
}

/** Id вида `000000000000000000000003` — как в фикстуре контракта Workshop. */
export function contractLessonId(suffix: number): string {
  return suffix.toString().padStart(24, '0');
}

// Фикстура контракта Workshop: суффикс id → UTC-начало и статус. Окно
// 2026-10-05T00:00+03:00 … 2026-10-19T00:00+03:00 должно дать 002, 003, 004, 005.
const CONTRACT_LESSONS: [number, string, LessonStatus][] = [
  [1, '2026-10-04T20:59:59Z', 'scheduled'],
  [2, '2026-10-04T21:00:00Z', 'scheduled'],
  [3, '2026-10-05T15:00:00Z', 'scheduled'],
  [4, '2026-10-06T16:00:00Z', 'cancelled'],
  [5, '2026-10-18T20:59:59Z', 'scheduled'],
  [6, '2026-10-18T21:00:00Z', 'scheduled'],
];

export function createPublicLessonHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const classModel = (): Model<ClassRecord> =>
    getApp().app.get(getModelToken(ClassRecord.name), { strict: false });
  const lessonModel = (): Model<LessonRecord> =>
    getApp().app.get(getModelToken(LessonRecord.name), { strict: false });

  /** Класс всегда с Zoom (ссылка и пароль, как прод-код — через encryptRecord):
   * публичный ответ обязан их не отдать. */
  async function createClass(options: NewPublicClass = {}): Promise<Types.ObjectId> {
    const cls = await classModel().create(
      encryptRecord(
        {
          title: options.title ?? 'Tai chi',
          groupLabel: 'School',
          format: 'both',
          location: options.location,
          zoomLink: ZOOM_LINK,
          zoomPassword: ZOOM_PASSWORD,
        },
        CLASS_ENCRYPT_SCHEMA,
      ),
    );
    return cls._id;
  }

  async function createLesson(lesson: NewPublicLesson): Promise<string> {
    const doc = await lessonModel().create(
      encryptRecord(
        {
          ...(lesson.id ? { _id: new MongooseTypes.ObjectId(lesson.id) } : {}),
          classId: lesson.classId,
          startsAt: new Date(lesson.startsAt),
          durationMin: 60,
          topic: lesson.topic ?? 'Practice',
          status: lesson.status ?? 'scheduled',
          tags: lesson.tags,
          zoomLinkOverride: lesson.withZoomOverride ? ZOOM_OVERRIDE : undefined,
          zoomPasswordOverride: lesson.withZoomOverride ? 'секрет-занятия' : undefined,
        },
        LESSON_ENCRYPT_SCHEMA,
      ),
    );
    return doc._id.toString();
  }

  async function seedContractLessons(): Promise<Types.ObjectId> {
    const classId = await createClass();
    for (const [suffix, startsAt, status] of CONTRACT_LESSONS) {
      await createLesson({ classId, startsAt, status, id: contractLessonId(suffix) });
    }
    return classId;
  }

  /** Перенос занятия фикстуры контракта на новое UTC-время. */
  async function moveLesson(suffix: number, startsAt: string): Promise<void> {
    await lessonModel().updateOne(
      { _id: contractLessonId(suffix) },
      { startsAt: new Date(startsAt) },
    );
  }

  /** `count` занятий с шагом в минуту от `first`, одним insertMany. */
  async function createLessonsEveryMinute(
    classId: Types.ObjectId,
    first: Date,
    count: number,
  ): Promise<void> {
    const MINUTE_MS = 60_000;
    await lessonModel().insertMany(
      Array.from({ length: count }, (_, i) => ({
        classId,
        startsAt: new Date(first.getTime() + i * MINUTE_MS),
        durationMin: 60,
        topic: `Занятие ${i}`,
      })),
    );
  }

  /** `rawQuery` — без «?», уже закодированная (`from=…%2B03:00`). */
  function getPublic(rawQuery = '', cookie?: string): request.Test {
    const req = request(server()).get(
      rawQuery ? `${PUBLIC_LESSONS_PATH}?${rawQuery}` : PUBLIC_LESSONS_PATH,
    );
    return cookie ? req.set('Cookie', cookie) : req;
  }

  async function clearAll(): Promise<void> {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  }

  return {
    server,
    classModel,
    lessonModel,
    createClass,
    createLesson,
    createLessonsEveryMinute,
    seedContractLessons,
    moveLesson,
    getPublic,
    clearAll,
  };
}
