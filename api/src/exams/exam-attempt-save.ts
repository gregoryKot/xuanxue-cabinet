// Атомарное сохранение ответов попытки (ТЗ 4.4, п.4–5) — вынесено из
// ExamAttemptsService.saveAnswers (находка аудита PR #175, docs/PLAN.md §11:
// «прочитал → слил → записал» не атомарный апдейт, два одновременных
// сохранения бота и кабинета одной секундой могли затереть друг друга —
// тихая потеря ответа, CLAUDE.md «Логи»). Тот же приём файл-лимита, что
// exam-attempt-lifecycle.ts: сервис остаётся диспетчером правил, Mongo-запрос
// живёт рядом со своим тестом на настоящей Mongo.
//
// `answers` хранится строкой целиком (encJson, exam-attempt.schema.ts —
// шифрование берёт только поля верхнего уровня документа), поэтому настоящий
// позиционный апдейт Mongo по элементу массива (`arrayFilters`) здесь
// невозможен без смены схемы на незашифрованный массив субдокументов — это
// отдельное решение уровня ADR, не однострочная правка. Вместо него —
// оптимистичная блокировка (compare-and-swap): апдейт условится не только на
// владении и статусе, но и на точном сыром значении `answers`, прочитанном
// перед слиянием. Если между чтением и записью кто-то другой поменял
// документ (свой ответ или его же дедлайн), findOneAndUpdate не матчится,
// цикл перечитывает актуальное состояние и повторяет слияние — mergeAnswers
// идемпотентен по itemId (exam-attempt-answers.ts), поэтому повтор не плодит
// дублей и не роняет уже применённый параллельно ответ.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  ATTEMPT_SAVE_CONFLICT_MESSAGE,
  type SaveAttemptAnswersInput,
} from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { encryptRecord } from '../utils/encryption';
import { assertAnswersKnown, mergeAnswers } from './exam-attempt-answers';
import { assertOpenForChange, closeIfExpiredAttempt } from './exam-attempt-lifecycle';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import {
  EXAM_ATTEMPT_ENCRYPT_SCHEMA,
  type ExamAttemptRecord,
} from './exam-attempt.schema';
import type { ExamNotifier } from './exam-notifier';
import { attemptSubmittedCallback } from './notify-attempt-submitted';

// Гонка двух живых клиентов (бот и кабинет) на одном документе расходится за
// один-два перечитывания; больше — либо шторм повторов от сломанного
// клиента, либо программная ошибка. Потолок — тот же приём, что попытки
// вставки в start(): понятный отказ вместо зависшего запроса.
const MAX_SAVE_RETRIES = 5;

export async function saveAttemptAnswers(
  model: Model<ExamAttemptRecord>,
  examNotifier: ExamNotifier,
  attemptId: string,
  userId: string,
  input: SaveAttemptAnswersInput,
  now: DateTime,
): Promise<LeanExamAttempt> {
  assertObjectId(attemptId, ATTEMPT_NOT_FOUND_MESSAGE);
  const onExpiredClose = attemptSubmittedCallback(examNotifier, now);

  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt++) {
    // Владелец из сессии, не из пути (SECURITY §3) — чужой `id` получает
    // «не найдена», не 403.
    const raw = await model
      .findOne({ _id: attemptId, userId })
      .lean<RawLeanExamAttempt>();
    if (!raw) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);

    const current = await closeIfExpiredAttempt(
      model,
      decryptAttempt(raw),
      now,
      onExpiredClose,
    );
    assertOpenForChange(current);
    assertAnswersKnown(current.blocks, input.answers);

    const merged = mergeAnswers(current.answers, input.answers);
    const encryptedAnswers = encryptRecord(
      { answers: merged },
      EXAM_ATTEMPT_ENCRYPT_SCHEMA,
    ).answers;

    // CAS: матчится только если раздел `answers` с момента чтения выше не
    // изменился — конкурентная запись увидит null и повторит цикл со свежим
    // состоянием (шапка файла), а не перетрёт её ответ своим слиянием.
    const updated = await model
      .findOneAndUpdate(
        { _id: attemptId, userId, status: 'in_progress', answers: raw.answers },
        { $set: { answers: encryptedAnswers } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanExamAttempt>();
    if (updated) return decryptAttempt(updated);
  }

  throw new ConflictError(ATTEMPT_SAVE_CONFLICT_MESSAGE);
}
