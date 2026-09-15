// «Дедлайны экзаменов» — шаг тика планировщика (docs/PLAN.md §11 слой 4.4
// п.7, блокер аудита 2026-09-15 «просроченная работа не попадает в очередь
// проверки никогда»): раньше попытку закрывал только ленивый путь — кто-то
// должен был тронуть именно её (start/saveAnswers/submit/list, см. шапку
// exam-attempt-lifecycle.ts), а фильтр учительской очереди
// (`GET /attempts?status=submitted`) не давал этому пути сработать вовсе.
// Ученик, который не вернулся в кабинет и не открыл бота, мог не закрыть
// свою попытку НИКОГДА, и учитель не узнавал, что работа вообще была —
// тихий отказ (CLAUDE.md «Логи»). Этот шаг проверяет дедлайны сам, раз в
// минуту, независимо от того, зашёл ли кто-то в кабинет: закрывает попытку и
// шлёт учителю то же уведомление, что и обычная сдача
// (attemptSubmittedCallback/notifyAttemptSubmitted, слой 4.7).
//
// Провайдер — в SchedulerModule, не в ExamsModule (тот же приём, что у
// RecordingPromptService/ManualPromptService — их провайдер тоже в
// scheduler.module.ts, комментарий там же): SchedulerModule берёт модель
// попытки через ExamAttemptModelModule (тонкая регистрация без контроллеров
// и остального ExamsModule) и свой экземпляр EXAM_NOTIFIER
// (TelegramExamNotifier), тем же приёмом, что уже есть для TEACHER_NOTIFIER —
// второй инстанс безопасен: TelegramExamNotifier не держит своего состояния
// между вызовами (personal-chats.ts читает Mongo каждый раз), в отличие от
// TelegramTeacherNotifier с Map-дедупом, из-за которого второй провайдер
// того сервиса когда-то был настоящим багом (комментарий в scheduler.module.ts).
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { closeExpiredAttempts } from './exam-attempt-lifecycle';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { EXAM_NOTIFIER, type ExamNotifier } from './exam-notifier';
import { attemptSubmittedCallback } from './notify-attempt-submitted';

// Кандидатов на тик — не «дай всё» (CLAUDE.md «API»): следующий тик (раз в
// минуту) доберёт остаток, тот же порядок, что у соседних шагов планировщика.
const DEADLINE_BATCH_LIMIT = 50;

export interface ExamDeadlineCloseResult {
  closed: number;
}

@Injectable()
export class ExamDeadlineCloseService {
  constructor(
    @InjectModel(ExamAttemptRecord.name) private readonly model: Model<ExamAttemptRecord>,
    @Inject(EXAM_NOTIFIER) private readonly examNotifier: ExamNotifier,
  ) {}

  async closeDue(now: DateTime): Promise<ExamDeadlineCloseResult> {
    const closed = await closeExpiredAttempts(
      this.model,
      now,
      DEADLINE_BATCH_LIMIT,
      attemptSubmittedCallback(this.examNotifier, now),
    );
    return { closed };
  }
}
