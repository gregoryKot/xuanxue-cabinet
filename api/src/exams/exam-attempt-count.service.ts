// Число попыток экзамена — учителю в редакторе формы (ADR-0022): попытка
// хранит снимок формы на момент старта, поэтому правка вопроса не доедет ни
// до уже начатых, ни до уже сданных работ, и учитель должен видеть, скольких
// это касается. Отдельный маленький сервис, а не метод ExamAttemptsService:
// тот уже на потолке файлового храповика (CLAUDE.md «Файлы»/«Храповики») —
// тот же приём, что ExamItemStatsService рядом с ExamItemsService,
// контроллер зовёт его напрямую, минуя основной сервис попытки.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EXAM_NOT_FOUND_MESSAGE, type ExamAttemptCountDto } from '@xuanxue/shared';
import { assertObjectId } from '../common/object-id';
import { ExamAttemptRecord } from './exam-attempt.schema';

@Injectable()
export class ExamAttemptCountService {
  constructor(
    @InjectModel(ExamAttemptRecord.name) private readonly model: Model<ExamAttemptRecord>,
  ) {}

  /** Считаются все попытки экзамена — идущие и сданные: обе группы уже унесли
   * снимок старой формы и правку вопроса не увидят. Только счётчик — сами
   * документы попытки (снимок, ответы) сюда не тянем. `examId` не проверяется
   * на существование формы: несуществующему id честно достаётся 0, второй
   * поход в базу ради этого не нужен. */
  async countByExam(examId: string): Promise<ExamAttemptCountDto> {
    assertObjectId(examId, EXAM_NOT_FOUND_MESSAGE);
    const total = await this.model.countDocuments({ examId });
    return { total };
  }
}
