// Test.createTestingModule с фейком сервиса — образец exams.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404/владение проверяет e2e
// (exam-attempts.e2e-spec.ts, exam-attempts-ownership.e2e-spec.ts) на
// настоящем гварде — здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import type { AttemptReviewDto, ExamAttemptDto, ExamGradingDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamGradingsService } from './exam-gradings.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: ['student'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const ATTEMPT_DTO: ExamAttemptDto = {
  id: 'a1',
  examId: 'e1',
  examTitle: 'Экзамен',
  userId: 'u1',
  status: 'in_progress',
  blocks: [],
  answers: [],
  startedAt: '2026-09-12T10:00:00.000Z',
  expired: false,
};

async function buildController(
  service: Partial<ExamAttemptsService> = {},
  gradingsService: Partial<ExamGradingsService> = {},
): Promise<ExamAttemptsController> {
  const module = await Test.createTestingModule({
    controllers: [ExamAttemptsController],
    providers: [
      { provide: ExamAttemptsService, useValue: service },
      { provide: ExamGradingsService, useValue: gradingsService },
    ],
  }).compile();
  return module.get(ExamAttemptsController);
}

describe('ExamAttemptsController', () => {
  it('start() передаёт examId и id пользователя из сессии в сервис', async () => {
    const start = jest.fn().mockResolvedValue(ATTEMPT_DTO);
    const controller = await buildController({ start });

    await expect(controller.start('e1', USER)).resolves.toEqual(ATTEMPT_DTO);
    expect(start).toHaveBeenCalledWith('e1', USER.id, expect.anything());
  });

  it('saveAnswers() передаёт id попытки, тело и id пользователя в сервис', async () => {
    const saveAnswers = jest.fn().mockResolvedValue(ATTEMPT_DTO);
    const controller = await buildController({ saveAnswers });
    const body = { answers: [{ itemId: 'i1', text: 'ответ' }] };

    await expect(controller.saveAnswers('a1', body, USER)).resolves.toEqual(ATTEMPT_DTO);
    expect(saveAnswers).toHaveBeenCalledWith('a1', USER.id, body, expect.anything());
  });

  it('submit() передаёт id попытки и id пользователя в сервис', async () => {
    const submit = jest.fn().mockResolvedValue(ATTEMPT_DTO);
    const controller = await buildController({ submit });

    await expect(controller.submit('a1', USER)).resolves.toEqual(ATTEMPT_DTO);
    expect(submit).toHaveBeenCalledWith('a1', USER.id, expect.anything());
  });

  it('list() передаёт query и пользователя из сессии в сервис', async () => {
    const list = jest.fn().mockResolvedValue([ATTEMPT_DTO]);
    const controller = await buildController({ list });

    await expect(controller.list({ examId: 'e1' }, USER)).resolves.toEqual([ATTEMPT_DTO]);
    expect(list).toHaveBeenCalledWith({ examId: 'e1' }, USER, expect.anything());
  });

  it('review() передаёт id попытки в сервис проверки', async () => {
    const reviewDto: AttemptReviewDto = {
      attemptId: 'a1',
      examId: 'e1',
      examTitle: 'Экзамен',
      userId: 'u1',
      status: 'submitted',
      blocks: [],
      rubric: [],
    };
    const getReview = jest.fn().mockResolvedValue(reviewDto);
    const controller = await buildController({}, { getReview });

    await expect(controller.review('a1')).resolves.toEqual(reviewDto);
    expect(getReview).toHaveBeenCalledWith('a1');
  });

  it('grade() передаёт id попытки, тело и id проверяющего в сервис проверки', async () => {
    const gradingDto: ExamGradingDto = {
      id: 'g1',
      attemptId: 'a1',
      examId: 'e1',
      userId: 'u1',
      graderId: 'teacher1',
      criteria: [],
      outcome: 'passed',
      gradedAt: '2026-09-12T10:00:00.000Z',
    };
    const grade = jest.fn().mockResolvedValue(gradingDto);
    const controller = await buildController({}, { grade });
    const teacher: UserLean = { ...USER, id: 'teacher1', roles: ['teacher'] };
    const body = { criteria: [], outcome: 'passed' as const };

    await expect(controller.grade('a1', body, teacher)).resolves.toEqual(gradingDto);
    expect(grade).toHaveBeenCalledWith('a1', 'teacher1', body, expect.anything());
  });
});
