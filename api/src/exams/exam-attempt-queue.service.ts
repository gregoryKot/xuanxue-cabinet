// Очередь проверки штата (`GET /attempts/queue`, аудит 2026-10-01 F33):
// `ExamAttemptsService.list` читал и расшифровывал снимок формы каждой
// попытки (blocks/answers, ≈28 КБ × до 200) ради строки списка из шести
// скалярных полей — учитель с телефона ждал мегабайты JSON при каждом входе
// в «Экзамены». Здесь — тот же фильтр (buildAttemptListFilter), та же
// сортировка и лимит, но проекция без снимка: `decryptRecord` пропускает
// отсутствующие поля, расшифровывается только `examTitle`. Своим файлом, а
// не методом ExamAttemptsService: тот стоит на файловом лимите (CLAUDE.md
// «Храповики»).
//
// Только штат (роль — на контроллере): фильтр собирается как для штата, по
// владельцу не скоупится. Ленивого закрытия по дедлайну здесь нет: очередь
// фильтрует по `submitted`/`graded`, и до F33 `list()` закрывал просроченные
// тоже только те, что уже прошли фильтр статуса в Mongo — то есть никогда;
// просроченные закрывает тик (ExamDeadlineCloseService, раз в минуту).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  type ExamAttemptQueueItemDto,
  type ListAttemptsQuery,
} from '@xuanxue/shared';
import { decryptRecord } from '../utils/encryption';
import { UserNamesService } from '../users/user-names.service';
import { buildAttemptListFilter } from './deleted-exam-ids';
import {
  toAttemptQueueItemDto,
  type LeanExamAttemptSummary,
} from './exam-attempt.mapper';
import { EXAM_ATTEMPT_ENCRYPT_SCHEMA, ExamAttemptRecord } from './exam-attempt.schema';
import { listGradingsForAttempts } from './exam-grading-list';
import { ExamGradingRecord } from './exam-grading.schema';
import { ExamsService } from './exams.service';

// Проекция «без снимка» — одна константа, чтобы e2e и спек проверяли ровно
// то, что уходит в запрос.
const WITHOUT_SNAPSHOT_PROJECTION = { blocks: 0, answers: 0 } as const;

@Injectable()
export class ExamAttemptQueueService {
  constructor(
    @InjectModel(ExamAttemptRecord.name) private readonly model: Model<ExamAttemptRecord>,
    @InjectModel(ExamGradingRecord.name)
    private readonly gradingModel: Model<ExamGradingRecord>,
    private readonly examsService: ExamsService,
    private readonly userNamesService: UserNamesService,
  ) {}

  async list(query: ListAttemptsQuery): Promise<ExamAttemptQueueItemDto[]> {
    // Попытки удалённых форм (ADR-0140) не всплывают — тот же фильтр, что у
    // полного списка; `isStaff: true` — маршрут и так только для штата.
    const deletedIds = await this.examsService.deletedIds();
    const filter = buildAttemptListFilter(deletedIds, query, true, '');
    const docs = await this.model
      .find(filter, WITHOUT_SNAPSHOT_PROJECTION)
      .sort({ startedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<LeanExamAttemptSummary[]>();
    const attempts = docs.map((doc) => decryptRecord(doc, EXAM_ATTEMPT_ENCRYPT_SCHEMA));

    // Имя ученика и оценка — одним запросом на весь список, не по документу
    // (тот же приём, что ExamAttemptsService.list).
    const names = await this.userNamesService.namesByIds(
      attempts.map((attempt) => attempt.userId.toString()),
    );
    const gradings = await listGradingsForAttempts(
      this.gradingModel,
      attempts.map((attempt) => attempt._id.toString()),
    );
    return attempts.map((attempt) =>
      toAttemptQueueItemDto(
        attempt,
        names.get(attempt.userId.toString()),
        gradings.get(attempt._id.toString()),
      ),
    );
  }
}
