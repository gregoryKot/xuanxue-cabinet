// Срок хранения попытки экзамена (PLAN §11 «Данные», ADR-0153): попытка ученика
// живёт EXAM_ATTEMPT_RETENTION_YEARS (3 года) после результата и уходит целиком —
// с оценкой, видео и уведомлением (exam-attempt-cascade.ts, тот же путь, что у
// повтора ADR-0131). Раньше срок был записан в PLAN и в шапке схемы, а уборщика
// не было: попытки жили вечно. Данные ученика не должны храниться дольше, чем
// нужны цели (проверка и история оценки), — а обещание без шага тика не работает
// (CLAUDE.md «Принцип всего файла», правило 1д).
//
// Что считается «результатом» — зависит от того, чем попытка кончилась:
// - проверена (`graded`): время последнего сохранения оценки (`exam_gradings.
//   gradedAt`). Переоценка сдвигает срок — результатом стала новая оценка;
// - сдана и не проверена (`submitted`): `submittedAt`, у сданной по времени —
//   момент дедлайна. Учитель за три года так и не открыл работу, хранить
//   её дальше незачем;
// - в работе (`in_progress`): результата нет. Считаем от последней правки
//   (`updatedAt`, каждое автосохранение его двигает), а не от `startedAt`:
//   работу, которую дописывали вчера, начатую три года назад, не трогаем. Попытку
//   с лимитом времени закрывает ExamDeadlineCloseService в течение минуты после
//   дедлайна, поэтому здесь остаются только брошенные попытки без лимита.
//
// Срок считается календарными годами в UTC (`now.toUTC().minus({ years })`): дата
// из шага тика не должна зависеть от пояса, в котором пришёл `now`, а лишний час
// перехода на летнее время на трёхлетней границе ничего не значит. Граница
// строгая (`$lt`): попытка ровно трёхлетней давности ещё живёт, как и у соседних
// уборщиков (payment-screenshot-sweep.service.ts).
//
// Побочное следствие (ADR-0131: номер попытки не освобождается, пока жива
// последняя): когда уходит ЕДИНСТВЕННАЯ попытка ученика по экзамену, его счётчик
// попыток по этому экзамену начинается с нуля. Через три года после результата
// это допустимо: история, по которой лимит считался, больше не хранится.
//
// TTL-индекс здесь не годится (тот же довод, что в ADR-0050): дата отсчёта
// зависит от статуса и для проверенных лежит в другой коллекции (`exam_gradings`),
// а TTL умеет только «поле плюс константа». Поэтому шаг тика — по образцу
// payment-screenshot-sweep.service.ts и answer-video-sweep.service.ts.
//
// Провайдер — в SchedulerModule, как у ExamDeadlineCloseService (комментарий там).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { QueryFilter, Model, Types } from 'mongoose';
import { EXAM_ATTEMPT_RETENTION_YEARS } from '@xuanxue/shared';
import { MediaAssetRecord } from '../media/media-asset.schema';
import { NotificationRecord } from '../notifications/notification.schema';
import {
  deleteAttemptWithDependents,
  type AttemptCascadeModels,
} from './exam-attempt-cascade';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { ExamGradingRecord } from './exam-grading.schema';

// Не «дай всё» (CLAUDE.md «API») — следующий тик (раз в минуту) доберёт остаток,
// тот же приём, что у SWEEP_BATCH_LIMIT соседних шагов.
const SWEEP_BATCH_LIMIT = 50;

export interface ExamAttemptRetentionSweepResult {
  /** Попыток, которые этот проход удалил (вместе с оценкой, видео, уведомлениями). */
  removed: number;
}

/** Дата, раньше которой результат считается отслужившим срок. */
function retentionBoundary(now: DateTime): Date {
  return now.toUTC().minus({ years: EXAM_ATTEMPT_RETENTION_YEARS }).toJSDate();
}

@Injectable()
export class ExamAttemptRetentionSweepService {
  private readonly logger = new Logger(ExamAttemptRetentionSweepService.name);
  private readonly models: AttemptCascadeModels;

  constructor(
    @InjectModel(ExamAttemptRecord.name) attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(ExamGradingRecord.name) gradingModel: Model<ExamGradingRecord>,
    @InjectModel(MediaAssetRecord.name) mediaModel: Model<MediaAssetRecord>,
    @InjectModel(NotificationRecord.name) notificationModel: Model<NotificationRecord>,
  ) {
    this.models = { attemptModel, gradingModel, mediaModel, notificationModel };
  }

  // `now` параметром (Luxon), не DateTime.utc() внутри — детерминизм теста
  // (CLAUDE.md «Тесты»).
  async removeExpired(now: DateTime): Promise<ExamAttemptRetentionSweepResult> {
    const boundary = retentionBoundary(now);
    const graded = await this.sweepGraded(boundary);
    const submitted = await this.sweepByAttemptDate({
      status: 'submitted',
      submittedAt: { $lt: boundary },
    });
    const idle = await this.sweepByAttemptDate({
      status: 'in_progress',
      updatedAt: { $lt: boundary },
    });
    const removed = graded + submitted + idle;
    // Только число, без id и имён (CLAUDE.md «Логи»): след того, что срок
    // хранения соблюдается, а не список того, кого удалили.
    if (removed > 0) {
      this.logger.log(`exam_attempts.retention removed=${removed}`);
    }
    return { removed };
  }

  /** Проверенные: кандидатов даёт `exam_gradings`, потому что `gradedAt` лежит
   * там. Условие удаления — `status: 'graded'`: попытка с неожиданным статусом
   * (оценка есть, а статус не сошёлся) попадёт под правило сданных ниже по
   * `submittedAt`, который старше оценки. */
  private async sweepGraded(boundary: Date): Promise<number> {
    const gradings = await this.models.gradingModel
      .find({ gradedAt: { $lt: boundary } }, { attemptId: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean<{ attemptId: Types.ObjectId }[]>();
    let removed = 0;
    for (const { attemptId } of gradings) {
      if (
        await deleteAttemptWithDependents(this.models, attemptId, { status: 'graded' })
      ) {
        removed += 1;
      }
    }
    return removed;
  }

  /** Сданные и брошенные: дата лежит в самой попытке. Тот же фильтр служит и
   * выборкой, и условием удаления, так что попытку, которую успели тронуть
   * между выборкой и удалением, каскад не заденет. */
  private async sweepByAttemptDate(
    filter: QueryFilter<ExamAttemptRecord>,
  ): Promise<number> {
    const candidates = await this.models.attemptModel
      .find(filter, { _id: 1 })
      .limit(SWEEP_BATCH_LIMIT)
      .lean<{ _id: Types.ObjectId }[]>();
    let removed = 0;
    for (const { _id } of candidates) {
      if (await deleteAttemptWithDependents(this.models, _id, filter)) removed += 1;
    }
    return removed;
  }
}
