// Сквозной e2e экзамена — критерий готовности этапа 4 (docs/PLAN.md §5, §11):
// «один экзамен целиком проведён через кабинет — от „учитель собрал форму“ до
// „ученик получил зачёт“, ни одного шага мимо кабинета». Один сценарий, шаги
// по порядку, как их пройдут живые люди: учитель — вопросы и форма, ученик —
// вход по ссылке-приглашению, попытка, ответы, видео, сдача; учитель —
// очередь, карточка проверки, оценка; ученик — итог. Каждый шаг — настоящий
// HTTP на настоящем AppModule (MongoMemoryServer), без единой прямой правки
// базы. Уведомления — через фейковый ExamNotifier: считаем вызовы, не шлём.
// Время — Settings.now Luxon, зафиксировано и сдвигается явно (CLAUDE.md
// «Детерминизм»): startedAt/submittedAt/gradedAt проверяются точно.
import type {
  AttemptReviewDto,
  ExamAttemptDto,
  ExamDto,
  ExamGradingDto,
  MyExamDto,
} from '@xuanxue/shared';
import { DateTime, Settings } from 'luxon';
import request from 'supertest';
import { EXAM_NOTIFIER } from '../src/exams/exam-notifier';
import { fakeExamNotifier } from '../src/exams/exam-notifier.test-support';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createExamFlowHelpers,
  FLOW_EXAM_DESCRIPTION,
  FLOW_EXAM_TITLE,
  FLOW_SINGLE_CRITERIA,
  FLOW_TEXT_CRITERIA,
} from './e2e-support/exam-flow-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

// Утро по школе (Asia/Jerusalem, UTC+3 летом) — момент, когда учитель собрал
// форму; остальные шаги отсчитываются от него.
const START = DateTime.fromISO('2026-09-17T07:00:00Z', { zone: 'utc' });
const VIDEO_URL = 'https://vk.com/video-12345_456';
const TEXT_ANSWER = 'Вес на задней ноге, колено над стопой, руки округлые.';
const TEACHER_COMMENT = 'Зачёт. Держите центр чуть ниже на переходах.';

describe('Экзамен целиком через кабинет (e2e, критерий этапа 4)', () => {
  let testApp: TestApp;
  const notifier = fakeExamNotifier();
  const { server, teacherBuildsExam, studentJoinsByInvite } = createExamFlowHelpers(
    () => testApp,
  );
  const realNow = Settings.now;

  /** Сдвиг часов сценария: все контроллеры берут `DateTime.utc()`, а он
   * читает `Settings.now` — сервер «живёт» в этом времени, не в машинном. */
  function clockAt(offset: { minutes?: number; days?: number }): DateTime {
    const moment = START.plus(offset);
    Settings.now = () => moment.toMillis();
    return moment;
  }

  beforeAll(async () => {
    clockAt({});
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(EXAM_NOTIFIER).useValue(notifier);
    });
  }, 60_000);

  afterAll(async () => {
    Settings.now = realNow;
    await testApp.close();
  });

  function myExam(cookie: string, examId: string): Promise<MyExamDto | undefined> {
    return request(server())
      .get('/api/me/exams')
      .set('Cookie', cookie)
      .then((res) => (res.body as MyExamDto[]).find((exam) => exam.id === examId));
  }

  function saveAnswers(
    cookie: string,
    attemptId: string,
    answers: unknown[],
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/attempts/${attemptId}/answers`))
      .set('Cookie', cookie)
      .send({ answers });
  }

  function linkVideo(cookie: string, attemptId: string, itemId: string): request.Test {
    return withCsrf(request(server()).post(`/api/attempts/${attemptId}/media/link`))
      .set('Cookie', cookie)
      .send({ url: VIDEO_URL, itemId });
  }

  function putGrading(cookie: string, attemptId: string): request.Test {
    return withCsrf(request(server()).put(`/api/attempts/${attemptId}/grading`))
      .set('Cookie', cookie)
      .send({ comment: TEACHER_COMMENT, outcome: 'passed' });
  }

  it('от «учитель собрал форму» до «ученик получил зачёт» — ни одного шага мимо кабинета', async () => {
    // Шаг 1–2. Учитель заводит три вопроса, собирает форму и публикует её.
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const built = await teacherBuildsExam(teacherCookie);
    const examView = await request(server())
      .get(`/api/exams/${built.examId}`)
      .set('Cookie', teacherCookie);
    expect(examView.status).toBe(200);
    const exam = examView.body as ExamDto;
    expect(exam.status).toBe('published');
    expect(exam.blocks.map((block) => block.itemIds)).toEqual([
      [built.textItemId, built.singleItemId],
      [built.videoItemId],
    ]);

    // Шаг 3. Ученик входит по ссылке-приглашению и видит экзамен у себя.
    const student = await studentJoinsByInvite('Пётр', 700_101);
    const stranger = await studentJoinsByInvite('Анна', 700_102);
    const beforeStart = await myExam(student.cookie, built.examId);
    expect(beforeStart).toMatchObject({
      title: FLOW_EXAM_TITLE,
      description: FLOW_EXAM_DESCRIPTION,
      attemptsUsed: 0,
    });
    expect(beforeStart?.lastAttempt).toBeUndefined();

    // Старт попытки: снимок формы, без правильных ответов и критериев.
    const started = await withCsrf(
      request(server()).post(`/api/exams/${built.examId}/attempts`),
    ).set('Cookie', student.cookie);
    expect(started.status).toBe(201);
    const attempt = started.body as ExamAttemptDto;
    expect(attempt.status).toBe('in_progress');
    expect(attempt.startedAt).toBe(START.toISO());
    const questions = attempt.blocks.flatMap((block) => block.questions);
    expect(questions.map((question) => question.kind)).toEqual([
      'text',
      'single',
      'video',
    ]);
    expect(questions[1]?.options[0]?.imageId).toBe(built.imageId);
    expect(JSON.stringify(started.body)).not.toContain('correct');
    expect(JSON.stringify(started.body)).not.toContain('criteria');

    // Картинка варианта из снимка — видна, картинка не из снимка — нет.
    const ownImage = await request(server())
      .get(`/api/exam-images/${built.imageId}`)
      .set('Cookie', student.cookie);
    expect(ownImage.status).toBe(200);
    const strayImage = await request(server())
      .get(`/api/exam-images/${built.strayImageId}`)
      .set('Cookie', student.cookie);
    expect(strayImage.status).toBe(404);

    // Автосохранение по ходу: два ответа по одному, второй не стирает первый.
    clockAt({ minutes: 5 });
    const firstSave = await saveAnswers(student.cookie, attempt.id, [
      { itemId: built.textItemId, text: TEXT_ANSWER },
    ]);
    expect(firstSave.status).toBe(200);
    clockAt({ minutes: 8 });
    const secondSave = await saveAnswers(student.cookie, attempt.id, [
      { itemId: built.singleItemId, optionIds: [built.correctOptionId] },
    ]);
    expect(secondSave.status).toBe(200);
    const reopened = await request(server())
      .get('/api/attempts')
      .set('Cookie', student.cookie);
    const reopenedAttempt = (reopened.body as ExamAttemptDto[]).find(
      (item) => item.id === attempt.id,
    );
    expect(reopenedAttempt?.answers).toEqual([
      { itemId: built.textItemId, text: TEXT_ANSWER },
      { itemId: built.singleItemId, optionIds: [built.correctOptionId] },
    ]);

    // Шаг 4. Видео — ссылкой к видео-вопросу (ADR-0023/0037).
    clockAt({ minutes: 12 });
    const linked = await linkVideo(student.cookie, attempt.id, built.videoItemId);
    expect(linked.status).toBe(201);

    // Шаг 5. Сдача: учителю уходит attempt_submitted, попытка в очереди.
    const submittedAt = clockAt({ minutes: 20 });
    const submitted = await withCsrf(
      request(server()).post(`/api/attempts/${attempt.id}/submit`),
    ).set('Cookie', student.cookie);
    expect(submitted.status).toBe(200);
    expect((submitted.body as ExamAttemptDto).status).toBe('submitted');
    expect((submitted.body as ExamAttemptDto).submittedAt).toBe(submittedAt.toISO());
    expect(notifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
    expect(notifier.notifyAttemptSubmitted.mock.calls[0]?.[0]).toEqual({
      attemptId: attempt.id,
      examId: built.examId,
      examTitle: FLOW_EXAM_TITLE,
      userId: student.userId,
    });

    const queue = await request(server())
      .get('/api/attempts')
      .query({ status: 'submitted' })
      .set('Cookie', teacherCookie);
    expect(queue.status).toBe(200);
    const queued = (queue.body as ExamAttemptDto[]).find(
      (item) => item.id === attempt.id,
    );
    expect(queued?.userName).toBe('Пётр');
    expect(queued?.media?.map((media) => media.itemId)).toEqual([built.videoItemId]);
    expect(JSON.stringify(queue.body)).not.toContain('fileId');

    // Шаг 6. Учитель на следующий день открывает карточку и ставит оценку.
    const gradedAt = clockAt({ days: 1 });
    const reviewRes = await request(server())
      .get(`/api/attempts/${attempt.id}/review`)
      .set('Cookie', teacherCookie);
    expect(reviewRes.status).toBe(200);
    const review = reviewRes.body as AttemptReviewDto;
    expect(review.userName).toBe('Пётр');
    const reviewed = review.blocks.flatMap((block) => block.questions);
    expect(reviewed[0]).toMatchObject({
      itemId: built.textItemId,
      criteria: FLOW_TEXT_CRITERIA,
      answerText: TEXT_ANSWER,
    });
    expect(reviewed[1]).toMatchObject({
      itemId: built.singleItemId,
      criteria: FLOW_SINGLE_CRITERIA,
      optionsCheck: {
        correctSelectedCount: 1,
        correctTotalCount: 1,
        incorrectSelectedCount: 0,
      },
    });
    expect(reviewed[1]?.options[0]).toMatchObject({
      correct: true,
      selected: true,
      imageId: built.imageId,
    });
    expect(review.media?.map((media) => [media.kind, media.itemId, media.url])).toEqual([
      ['link', built.videoItemId, VIDEO_URL],
    ]);

    const graded = await putGrading(teacherCookie, attempt.id);
    expect(graded.status).toBe(200);
    expect((graded.body as ExamGradingDto).outcome).toBe('passed');
    expect((graded.body as ExamGradingDto).gradedAt).toBe(gradedAt.toISO());
    // Повторное «Сохранить» с теми же значениями — второго уведомления нет.
    const gradedAgain = await putGrading(teacherCookie, attempt.id);
    expect(gradedAgain.status).toBe(200);

    // Шаг 7. Ученик видит итог и комментарий; exam_result ушёл ровно один раз.
    const afterGrading = await myExam(student.cookie, built.examId);
    expect(afterGrading?.attemptsUsed).toBe(1);
    expect(afterGrading?.lastAttempt).toMatchObject({
      id: attempt.id,
      status: 'graded',
      outcome: 'passed',
      comment: TEACHER_COMMENT,
    });
    expect(JSON.stringify(afterGrading)).not.toContain(FLOW_TEXT_CRITERIA);
    expect(JSON.stringify(afterGrading)).not.toContain('correct');
    expect(notifier.notifyExamGraded).toHaveBeenCalledTimes(1);
    expect(notifier.notifyExamGraded.mock.calls[0]?.[0]).toMatchObject({
      attemptId: attempt.id,
      userId: student.userId,
      outcome: 'passed',
      comment: TEACHER_COMMENT,
    });

    // Шаг 8. Второй ученик ничего из этого не видит (владение, SECURITY §3).
    const strangerExam = await myExam(stranger.cookie, built.examId);
    expect(strangerExam?.attemptsUsed).toBe(0);
    expect(strangerExam?.lastAttempt).toBeUndefined();
    const strangerAttempts = await request(server())
      .get('/api/attempts')
      .set('Cookie', stranger.cookie);
    expect(strangerAttempts.body).toEqual([]);
    const strangerImage = await request(server())
      .get(`/api/exam-images/${built.imageId}`)
      .set('Cookie', stranger.cookie);
    expect(strangerImage.status).toBe(404);
    const strangerLink = await linkVideo(stranger.cookie, attempt.id, built.videoItemId);
    expect(strangerLink.status).toBe(404);
    const strangerReview = await request(server())
      .get(`/api/attempts/${attempt.id}/review`)
      .set('Cookie', stranger.cookie);
    expect(strangerReview.status).toBe(403);
  });
});
