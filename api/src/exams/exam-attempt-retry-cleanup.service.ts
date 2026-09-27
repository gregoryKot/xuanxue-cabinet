// Затирание просроченной непроверенной попытки при повторном старте (отзыв
// тестировщицы 2026-09-23, п.4: «сначала учитель должен проверить, а потом
// давать ещё раз — иначе люди понатыкают десять раз, учитель точно не будет
// проверять все»; решение владельца — ADR-0131). Ученика прервало время, не
// отказ (ADR-0091) — второй попытке быть, но ценой первой: новая ЗАМЕНЯЕТ
// старую, а не копится рядом. `graded` попытку правило не трогает — учитель
// уже отвечал за неё, история оценки остаётся.
//
// Отдельным провайдером, а не методом ExamAttemptsService (CLAUDE.md
// «Файлы» — тот сервис уже на потолке файлового храповика, тот же приём, что
// у ExamAttemptCountService рядом): здесь и поиск последней попытки ученика
// (та же цифра, что нужна лимиту попыток — willRetryDeletePreviousAttempt в
// shared/src/my-exams.ts объясняет, почему решение об удалении смотрит
// именно на неё), и каскад удаления.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ExamAttemptStatus } from '@xuanxue/shared';
import { MediaAssetRecord } from '../media/media-asset.schema';
import { NotificationRecord } from '../notifications/notification.schema';
import { ExamAttemptRecord } from './exam-attempt.schema';

/** Всё, что нужно знать о последней попытке ученика по форме, чтобы решить
 * лимит и удаление — не полный снимок: расшифровывать блоки/ответы прежней
 * попытки здесь незачем, старт нового никогда их не читает. */
export interface LastAttemptSummary {
  _id: Types.ObjectId;
  attemptNo: number;
  status: ExamAttemptStatus;
  expired: boolean;
}

@Injectable()
export class ExamAttemptRetryCleanupService {
  constructor(
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(MediaAssetRecord.name)
    private readonly mediaModel: Model<MediaAssetRecord>,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
  ) {}

  /** Последняя попытка ученика по форме (наибольший `attemptNo`) — `null`,
   * если попыток ещё не было. Число попыток (`attemptsUsed`, лимит в
   * ExamAttemptsService.start) — это её `attemptNo`, не количество
   * документов: удаление ниже убирает старый документ, но не освобождает
   * его номер, иначе лимит откатывался бы назад с каждым повтором. */
  async findLastAttempt(
    examId: string,
    userId: string,
  ): Promise<LastAttemptSummary | null> {
    return this.attemptModel
      .findOne({ examId, userId })
      .sort({ attemptNo: -1 })
      .select({ attemptNo: 1, status: 1, expired: 1 })
      .lean<LastAttemptSummary | null>();
  }

  /** Удаляет `attempt`, если она сдана временем и ещё не проверена — та
   * самая попытка, которую тестировщица просила не давать пересдавать без
   * взгляда учителя, а владелец разрешил перезапускать только ценой замены.
   * Вызывать ПОСЛЕ того, как новая попытка уже создана (ADR-0131): гонка
   * двойного старта не должна снести свежую попытку, потому что удаление
   * целится в id, захваченный ДО создания, не в «последнюю просроченную»,
   * найденную заново.
   *
   * Условие в `deleteOne` — не просто «удалить по id»: если учитель успел
   * проверить работу ровно в этот момент (`status` стал `graded`) или другой
   * конкурентный вызов уже удалил её, фильтр не совпадёт, `deletedCount`
   * будет 0 — тогда каскад ниже не трогаем, историю оценки не рвём.
   *
   * Что уносит каскад и что нет (ADR-0131 «Последствия»):
   * - `media_assets` (видео, ADR-0023) — байтов там нет, только file_id/
   *   ссылка, поэтому просто `deleteMany`, стороннего хранилища чистить
   *   незачем;
   * - уведомления учителя об этой попытке (`notifications`, ADR-0113) —
   *   удаляются, а не гасятся `dismissedAt`: та мягкая пометка защищает от
   *   воскрешения повторной доставкой ТОГО ЖЕ события, а здесь событие
   *   ссылается на документ, которого больше нет вовсе — ссылка `/grading/
   *   :id` в непочищенной строке вела бы в 404;
   * - `exam_images` (картинки вариантов) — НЕ трогаем: они не персональные
   *   данные ученика (ADR-0035), а сироту без единой ссылки убирает штатный
   *   `ExamImageSweepService` сам в течение суток, второй механизм той же
   *   уборки заводить незачем;
   * - `exam_gradings` — попытка сюда просто не доходит: у неё нет оценки
   *   (`status !== 'graded'` в условии удаления), значит и оценивать
   *   нечего. */
  async deleteIfExpiredUngraded(attempt: LastAttemptSummary): Promise<void> {
    if (attempt.status !== 'submitted' || !attempt.expired) return;
    const { deletedCount } = await this.attemptModel.deleteOne({
      _id: attempt._id,
      status: 'submitted',
      expired: true,
    });
    if (deletedCount === 0) return;
    await Promise.all([
      this.mediaModel.deleteMany({ attemptId: attempt._id }),
      this.notificationModel.deleteMany({ attemptId: attempt._id.toString() }),
    ]);
  }
}
