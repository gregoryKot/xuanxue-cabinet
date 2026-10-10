// Общие шаги e2e записи занятия файлом (ADR-0180): готовое видео, прошедшее
// занятие и запись с videoId. Вынесены из спека, чтобы он уместился в потолок
// файл-храповика (CLAUDE.md «Храповики»).
import request from 'supertest';
import type { LessonDto, VideoUploadDto } from '@xuanxue/shared';
import { partBuffer, SMALL_SIZE } from './answer-video-fixtures';
import type { createExamVideoPartsHelpers } from './exam-video-parts-fixtures';
import { withCsrf } from './http';
import { STARTS_AT, type createLessonTestHelpers } from './lessons-fixtures';

type LessonHelpers = ReturnType<typeof createLessonTestHelpers>;
type PartsHelpers = ReturnType<typeof createExamVideoPartsHelpers>;

export function createLessonVideoFlow(lessons: LessonHelpers, parts: PartsHelpers) {
  /** Готовое видео: старт, единственная часть, complete. */
  async function uploadReady(cookie: string, poster?: Buffer): Promise<string> {
    const upload = (await parts.start(cookie, SMALL_SIZE)).body as VideoUploadDto;
    await parts.putPart(cookie, upload.id, 1, partBuffer(SMALL_SIZE, true));
    const body = poster ? { poster: poster.toString('base64') } : undefined;
    const done = await parts.complete(cookie, upload.id, body);
    if (done.status !== 201) {
      throw new Error(`uploadReady: complete вернул ${done.status}: ${done.text}`);
    }
    return upload.id;
  }

  /** Занятие в прошлом: только такие попадают в архив ученика. */
  async function createPastLesson(teacher: string): Promise<string> {
    const classId = await lessons.createClass();
    const created = await lessons.postLesson(teacher, { classId, startsAt: STARTS_AT });
    return (created.body as LessonDto).id;
  }

  function addRecording(
    cookie: string,
    lessonId: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(parts.server()).post(`/api/lessons/${lessonId}/recording`))
      .set('Cookie', cookie)
      .send(body);
  }

  return { uploadReady, createPastLesson, addRecording };
}
