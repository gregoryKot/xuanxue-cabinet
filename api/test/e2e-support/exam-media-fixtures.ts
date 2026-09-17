// Общий HTTP-хелпер для e2e видео экзамена — делит exam-media.e2e-spec.ts и
// exam-media-item.e2e-spec.ts (тот же приём, что exam-attempts-fixtures.ts:
// файл-лимит спеков без дублей, CLAUDE.md «Храповики»/jscpd).
import type { ExamAttemptDto, ExamDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

export interface AttemptWithItems {
  attemptId: string;
  videoItemId: string;
  textItemId: string;
}

/** `getApp` — геттер, не значение: как в exam-attempts-fixtures.ts —
 * вызывается лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createExamMediaTestHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();

  // Форма с video-вопросом и text-вопросом — второй нужен тестам itemId
  // (ADR-0037): «чужой» и «не video» отказы адресуют реальный вопрос снимка,
  // не выдуманный id.
  async function startedAttemptWithItems(
    studentCookie: string,
  ): Promise<AttemptWithItems> {
    const teacherCookie = await sessionCookieFor(getApp().app, ['teacher']);
    const videoItem = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'video', prompt: 'Снимите форму «пэнбу»' });
    const videoItemId = (videoItem.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${videoItemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const textItem = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'text', prompt: 'Опишите форму словами' });
    const textItemId = (textItem.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${textItemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({
        title: 'Экзамен с видео',
        blocks: [{ itemIds: [videoItemId, textItemId] }],
      });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    return { attemptId: (started.body as ExamAttemptDto).id, videoItemId, textItemId };
  }

  async function startedAttempt(studentCookie: string): Promise<string> {
    const { attemptId } = await startedAttemptWithItems(studentCookie);
    return attemptId;
  }

  return { server, startedAttempt, startedAttemptWithItems };
}
