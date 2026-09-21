// Test.createTestingModule с фейком сервиса — образец exams.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404/владение проверяет e2e
// (exam-attempts.e2e-spec.ts, exam-attempts-ownership.e2e-spec.ts) на
// настоящем гварде — здесь только «контроллер зовёт сервис и возвращает его ответ».
import { Test } from '@nestjs/testing';
import type {
  AttemptReviewDto,
  ExamAttemptCountDto,
  ExamAttemptDto,
  ExamGradingDto,
} from '@xuanxue/shared';
import { MediaAssetsService } from '../media/media-assets.service';
import type { UserLean } from '../users/users.service';
import { ExamAttemptCountService } from './exam-attempt-count.service';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamGradingsService } from './exam-gradings.service';

/** По умолчанию — без видео (пустой список): маршрутизацию к
 * MediaAssetsService проверяет media-assets.service.spec.ts и
 * exam-attempt-media.spec.ts, здесь — что контроллер её действительно зовёт. */
function fakeMediaAssetsService(): Partial<MediaAssetsService> {
  return {
    listForAttempt: jest.fn().mockResolvedValue([]),
    listForAttempts: jest.fn().mockResolvedValue(new Map()),
  };
}

const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
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
  media: [],
};

async function buildController(
  service: Partial<ExamAttemptsService> = {},
  gradingsService: Partial<ExamGradingsService> = {},
  mediaAssetsService: Partial<MediaAssetsService> = fakeMediaAssetsService(),
  countService: Partial<ExamAttemptCountService> = {},
): Promise<ExamAttemptsController> {
  const module = await Test.createTestingModule({
    controllers: [ExamAttemptsController],
    providers: [
      { provide: ExamAttemptsService, useValue: service },
      { provide: ExamGradingsService, useValue: gradingsService },
      { provide: MediaAssetsService, useValue: mediaAssetsService },
      { provide: ExamAttemptCountService, useValue: countService },
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

  it('countByExam() передаёт examId в сервис счётчика попыток', async () => {
    const countDto: ExamAttemptCountDto = { total: 2 };
    const countByExam = jest.fn().mockResolvedValue(countDto);
    const controller = await buildController({}, {}, fakeMediaAssetsService(), {
      countByExam,
    });

    await expect(controller.countByExam('e1')).resolves.toEqual(countDto);
    expect(countByExam).toHaveBeenCalledWith('e1');
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
      userName: 'Ученик',
      status: 'submitted',
      blocks: [],
      notifiesUserInTelegram: false,
      media: [],
    };
    const getReview = jest.fn().mockResolvedValue(reviewDto);
    const controller = await buildController({}, { getReview });

    await expect(controller.review('a1')).resolves.toEqual(reviewDto);
    expect(getReview).toHaveBeenCalledWith('a1');
  });

  it('grade() пишет оценку, затем отдаёт карточку проверки целиком (не ExamGradingDto, не 204)', async () => {
    const gradingDto: ExamGradingDto = {
      id: 'g1',
      attemptId: 'a1',
      examId: 'e1',
      userId: 'u1',
      graderId: 'teacher1',
      outcome: 'passed',
      gradedAt: '2026-09-12T10:00:00.000Z',
    };
    const reviewDto: AttemptReviewDto = {
      attemptId: 'a1',
      examId: 'e1',
      examTitle: 'Экзамен',
      userId: 'u1',
      userName: 'Ученик',
      status: 'graded',
      blocks: [],
      notifiesUserInTelegram: true,
      grading: gradingDto,
      media: [],
    };
    const grade = jest.fn().mockResolvedValue(gradingDto);
    const getReview = jest.fn().mockResolvedValue(reviewDto);
    const controller = await buildController({}, { grade, getReview });
    const teacher: UserLean = { ...USER, id: 'teacher1', roles: ['teacher'] };
    const body = { outcome: 'passed' as const };

    await expect(controller.grade('a1', body, teacher)).resolves.toEqual(reviewDto);
    expect(grade).toHaveBeenCalledWith('a1', 'teacher1', body, expect.anything());
    expect(getReview).toHaveBeenCalledWith('a1');
  });
});
