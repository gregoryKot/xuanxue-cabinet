// Общие HTTP-хелперы для e2e попытки экзамена — делят exam-attempts.e2e-spec.ts
// и exam-attempts-deadline.e2e-spec.ts (тот же приём, что lessons-fixtures.ts
// у lessons.e2e-spec.ts/lessons-broadcast-status.e2e-spec.ts: файл-лимит
// спеков без дублей, CLAUDE.md «Храповики»/jscpd).
import type { ExamDto, ExamItemDto, UserRole } from '@xuanxue/shared';
import request from 'supertest';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

/** `getApp` — геттер, не значение: как в lessons-fixtures.ts — вызывается
 * лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createExamAttemptsTestHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();

  // Опубликованный вопрос и опубликованная форма — через настоящие эндпоинты
  // учителя (не напрямую через модель): здесь не тестируется сам банк/форма,
  // у них свои e2e (exam-items.e2e-spec.ts, exams.e2e-spec.ts), важно только,
  // что попытка стартует на реальной опубликованной форме.
  async function createPublishedExam(
    teacherCookie: string,
    options: { attemptsAllowed?: number; shuffleOptions?: boolean } = {},
  ): Promise<{ examId: string; itemId: string; optionIds: string[] }> {
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'single',
        prompt: 'Сколько форм в базовом комплексе?',
        // Четыре варианта, а не два: на двух перемешивание совпадает с
        // исходным порядком слишком часто, и тест про него был бы мигающим
        // (CLAUDE.md «Детерминизм»).
        options: [
          { text: 'пять', correct: true },
          { text: 'три', correct: false },
          { text: 'восемь', correct: false },
          { text: 'двенадцать', correct: false },
        ],
      });
    const itemId = (item.body as ExamItemDto).id;
    const optionIds = (item.body as ExamItemDto).options.map((option) => option.id);
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({
        title: 'Экзамен по третьей форме',
        blocks: [{ title: 'Форма', itemIds: [itemId] }],
        attemptsAllowed: options.attemptsAllowed,
        shuffleOptions: options.shuffleOptions,
      });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    return { examId, itemId, optionIds };
  }

  return {
    server,
    sessionFor: (roles: UserRole[]): Promise<string> =>
      sessionCookieFor(getApp().app, roles),
    createPublishedExam,
  };
}
