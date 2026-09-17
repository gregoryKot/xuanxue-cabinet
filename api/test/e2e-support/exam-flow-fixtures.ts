// Хелперы сквозного e2e экзамена (exam-full-flow.e2e-spec.ts, критерий
// готовности этапа 4 — PLAN §5/§11): учитель собирает форму из трёх вопросов
// через настоящие эндпоинты, ученик входит по ссылке-приглашению через
// настоящий POST /auth/telegram (ADR-0030/0036), а не через cookie напрямую
// в БД — сценарий должен пройти тем же путём, что и живой человек. Вынесено
// из спека по образцу exam-media-fixtures.ts (файл-лимит спеков, CLAUDE.md
// «Храповики»); мелкие кирпичи — общие фикстуры рядом, не копии.
import type { ExamDto, ExamImageDto, ExamItemDto, MeDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTelegramInviteHelpers } from './auth-telegram-invite-fixtures';
import type { TestApp } from './create-app';
import { jpegBytes } from './exam-images-fixtures';
import { withCsrf } from './http';
import { freshIp, telegramLoginBody } from './telegram-widget-fixtures';

export const FLOW_EXAM_TITLE = 'Первый уровень';
export const FLOW_EXAM_DESCRIPTION = 'Три вопроса: слова, картинка и видео формы.';
export const FLOW_TEXT_CRITERIA = 'Смотреть на колено и центр тяжести';
export const FLOW_SINGLE_CRITERIA = 'Верный вариант — фотография стойки';

export interface BuiltExam {
  examId: string;
  textItemId: string;
  singleItemId: string;
  videoItemId: string;
  /** Картинка варианта из снимка попытки — ученику попытки доступна. */
  imageId: string;
  /** Картинка, которой нет ни в одном снимке — ученику недоступна. */
  strayImageId: string;
  correctOptionId: string;
  wrongOptionId: string;
}

export interface JoinedStudent {
  userId: string;
  cookie: string;
}

/** `getApp` — геттер, не значение: как в exam-media-fixtures.ts —
 * вызывается лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createExamFlowHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const invite = createTelegramInviteHelpers(getApp);

  function postJson(cookie: string, path: string, body: object): request.Test {
    return withCsrf(request(server()).post(path)).set('Cookie', cookie).send(body);
  }

  async function uploadImage(teacherCookie: string): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/exam-images'))
      .set('Cookie', teacherCookie)
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());
    if (res.status !== 201) throw new Error(`картинка не загрузилась: ${res.status}`);
    return (res.body as ExamImageDto).id;
  }

  /** Вопрос заводится без `status` — по ADR-0033 он сразу `published`, и
   * отдельного шага «опубликовать вопрос» у учителя нет; проверяем это
   * здесь, а не доверяем: иначе форма не опубликуется на шаге ниже. */
  async function createItem(
    teacherCookie: string,
    body: Record<string, unknown>,
  ): Promise<ExamItemDto> {
    const res = await postJson(teacherCookie, '/api/exam-items', body);
    if (res.status !== 201) {
      throw new Error(`вопрос не создался: ${res.status} ${JSON.stringify(res.body)}`);
    }
    const item = res.body as ExamItemDto;
    if (item.status !== 'published') {
      throw new Error(`вопрос без status не опубликован сразу: ${item.status}`);
    }
    return item;
  }

  /** Шаги 1–2 сценария: три вопроса (текст, выбор с картинкой варианта,
   * видео), форма из двух блоков, публикация. Всё — через API учителя. */
  async function teacherBuildsExam(teacherCookie: string): Promise<BuiltExam> {
    const imageId = await uploadImage(teacherCookie);
    const strayImageId = await uploadImage(teacherCookie);

    const textItem = await createItem(teacherCookie, {
      kind: 'text',
      prompt: 'Опишите форму «пэнбу» словами',
      criteria: FLOW_TEXT_CRITERIA,
    });
    const singleItem = await createItem(teacherCookie, {
      kind: 'single',
      prompt: 'Какая стойка на фото?',
      criteria: FLOW_SINGLE_CRITERIA,
      options: [
        { imageId, correct: true },
        { text: 'Другая стойка', correct: false },
      ],
    });
    const videoItem = await createItem(teacherCookie, {
      kind: 'video',
      prompt: 'Снимите форму «пэнбу» целиком',
    });
    const [correctOption, wrongOption] = singleItem.options;
    if (!correctOption || !wrongOption) throw new Error('у вопроса два варианта');

    const created = await postJson(teacherCookie, '/api/exams', {
      title: FLOW_EXAM_TITLE,
      description: FLOW_EXAM_DESCRIPTION,
      blocks: [
        { title: 'Теория', itemIds: [textItem.id, singleItem.id] },
        { title: 'Форма', itemIds: [videoItem.id] },
      ],
    });
    if (created.status !== 201) {
      throw new Error(
        `форма не создалась: ${created.status} ${JSON.stringify(created.body)}`,
      );
    }
    const examId = (created.body as ExamDto).id;
    const published = await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    if (published.status !== 200) {
      throw new Error(`форма не опубликовалась: ${published.status}`);
    }

    return {
      examId,
      textItemId: textItem.id,
      singleItemId: singleItem.id,
      videoItemId: videoItem.id,
      imageId,
      strayImageId,
      correctOptionId: correctOption.id,
      wrongOptionId: wrongOption.id,
    };
  }

  /** Шаг 3 сценария: новый человек входит по ссылке-приглашению школы
   * (ADR-0030/0036) — cookie из настоящего Set-Cookie ответа входа, роли
   * нет, значит ученик (ADR-0026). */
  async function studentJoinsByInvite(
    firstName: string,
    telegramId: number,
  ): Promise<JoinedStudent> {
    const code = await invite.currentInviteCode();
    const res = await invite.post(
      telegramLoginBody({ id: telegramId, first_name: firstName }),
      freshIp(),
      code,
    );
    if (res.status !== 200) {
      throw new Error(
        `вход по ссылке не удался: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    const me = res.body as MeDto;
    if (me.roles.length !== 0) throw new Error('вошедший по ссылке — ученик без ролей');
    return { userId: me.id, cookie: String(res.headers['set-cookie']) };
  }

  return { server, teacherBuildsExam, studentJoinsByInvite };
}
