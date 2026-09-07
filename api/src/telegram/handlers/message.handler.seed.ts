// Данные для message.handler.*.spec.ts — вынесены из test-support.ts
// (файл-лимит 150 строк, CLAUDE.md «Храповики»). seedTeacher — общий с
// callback-query.handler.test-support.ts, живёт в test-support/seed-teacher.ts
// (jscpd: та же функция, не копия).
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { CLASS_ENCRYPT_SCHEMA, type ClassRecord } from '../../classes/class.schema';
import type { LessonRecord } from '../../lessons/lesson.schema';
import { encryptRecord } from '../../utils/encryption';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

export async function seedLesson(
  classModel: Model<ClassRecord>,
  lessonModel: Model<LessonRecord>,
) {
  const cls = await classModel.create(
    encryptRecord(
      {
        title: 'цигун для глаз',
        groupLabel: '',
        format: 'online',
        zoomLink: 'https://zoom.example/1',
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
        active: true,
        channelIds: [],
      },
      CLASS_ENCRYPT_SCHEMA,
    ),
  );
  return lessonModel.create({
    classId: cls._id,
    startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
    durationMin: 60,
    topic: 'старая тема',
    status: 'scheduled',
  });
}
