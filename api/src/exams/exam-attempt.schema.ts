// Попытка сдачи экзамена (ADR-0022 + дополнение 2026-09-12, PLAN §11 слой
// 4.4) — данные ученика (ADR-0010), первая коллекция с `userId` в проекте:
// владение — в USER_OWNED_COLLECTIONS, срок хранения — 3 года после результата
// (ExamAttemptRetentionSweepService, ADR-0153). Исключение — попытка, сданная по
// истечении времени и так и не проверенная: повтор удаляет её раньше срока,
// вместе с видео и уведомлением учителя (ExamAttemptRetryCleanupService, ADR-0131).
//
// `blocks` — снимок формы на момент старта: `correct` варианта и критерии
// проверки лежат здесь для будущей проверки, но за пределы документа не
// выходят — маппер в ExamAttemptDto их не копирует (обязательный e2e-тест).
// `answers` — свободный текст ответа. Оба — целиком строкой (`encJson`), тем
// же приёмом, что `options`/`history` в exam-item.schema.ts: encryptRecord
// шифрует только поля верхнего уровня документа.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_ATTEMPT_STATUSES } from '@xuanxue/shared';
import type { ExamAttemptStatus, ExamItemKind } from '@xuanxue/shared';
import {
  enc,
  encJson,
  plain,
  encryptSchemaFrom,
  type FieldPolicy,
} from '../common/field-policy';

export interface AttemptOptionRecord {
  id: string;
  text: string;
  correct: boolean;
  imageId?: string;
  /** Видео варианта (ADR-0133) тем же смыслом, что imageId. */
  videoId?: string;
  videoUrl?: string;
}

/** Вопрос в снимке — редакция вопроса банка на момент старта (`version`
 * закрепляет попытка, не форма — дополнение к ADR-0022). Снимки, заведённые
 * до ADR-0128, могут хранить внутри JSON ещё и `hint`/`criteria` — тип их не
 * описывает и никто их больше не читает (expand → contract). */
export interface AttemptQuestionRecord {
  itemId: string;
  version: number;
  kind: ExamItemKind;
  prompt: string;
  /** Видео формулировки вопроса (ADR-0133) тем же смыслом, что у варианта. */
  videoId?: string;
  videoUrl?: string;
  options: AttemptOptionRecord[];
  /** Требование объяснения на момент старта попытки (ADR-0146) — снимок, не
   * сегодняшняя настройка вопроса банка. */
  askReason?: boolean;
}

/** Блок в снимке — порядок вопросов и порядок вариантов внутри вопроса уже
 * зафиксированы (перемешивание `shuffle` у блока и `shuffleOptions` у формы,
 * если они были, случилось один раз при старте, exam-attempt-snapshot.ts). */
export interface AttemptBlockRecord {
  id: string;
  title: string;
  /** Историческое, в контракт не отдаётся (ADR-0033) — снимки старых попыток
   * его хранят, и переписывать их нельзя: попытка живёт тем, что видел
   * сдающий. */
  required?: boolean;
  questions: AttemptQuestionRecord[];
}

@Schema({ timestamps: true, collection: 'exam_attempts' })
export class ExamAttemptRecord {
  // Ссылка на форму — как classId у занятий (lesson.schema.ts): без `ref`,
  // это не признак владения и не ссылка на пользователя (USER_REFERENCE_PATHS
  // — только про пользователя).
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  examId!: Types.ObjectId;

  // Снимок названия формы на момент старта — тем же принципом, что и
  // остальной снимок: правка названия формы не должна менять то, что видел
  // сдающий на экране попытки.
  @Prop({ type: String, required: true })
  examTitle!: string;

  // Владение (чеклист CLAUDE.md, п.1) — по этому полю скоупится каждая
  // выборка/правка ученика (SECURITY §3). Без `ref`: это не «ссылка на
  // пользователя из данных школы» (USER_REFERENCE_PATHS — про leaderId/
  // createdBy, обнуляемые при удалении аккаунта), а сам признак владения —
  // документ целиком удаляется через USER_OWNED_COLLECTIONS, не $unset.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  // Номер попытки этого ученика по этой форме — часть уникального индекса
  // ниже, держит и идемпотентность старта, и лимит attemptsAllowed (ТЗ 4.4,
  // п.2: атомарно, не «посчитали и вставили»).
  @Prop({ type: Number, required: true })
  attemptNo!: number;

  @Prop({ type: String, enum: EXAM_ATTEMPT_STATUSES, default: 'in_progress' })
  status!: ExamAttemptStatus;

  // Хранится строкой целиком (encJson) — см. комментарий в начале файла.
  @Prop({ type: String, default: '[]' })
  blocks!: string;

  // Хранится строкой целиком (encJson) — см. комментарий в начале файла.
  @Prop({ type: String, default: '[]' })
  answers!: string;

  // Плоская копия imageId вариантов снимка — blocks зашифрован целиком и
  // Mongo внутрь не видит; ExamImagesService.load решает по этому полю,
  // можно ли ученику картинку (SECURITY §3, ADR-0035). Пишет createAttempt
  // при старте попытки (exam-attempt-start.ts, collectAttemptImageIds) — у
  // старых попыток поля нет, Mongo трактует отсутствие как пустой массив.
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  imageIds!: Types.ObjectId[];

  // Плоская копия videoId вопросов/вариантов снимка — тем же приёмом и ради
  // той же причины, что imageIds выше (ADR-0133): ExamVideosService.signedUrl
  // решает по этому полю, можно ли ученику видео (SECURITY §3). Пишет
  // createAttempt (exam-attempt-start.ts, collectAttemptVideoIds).
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  videoIds!: Types.ObjectId[];

  @Prop({ type: Date, required: true })
  startedAt!: Date;

  // Есть только если у формы стоит лимит времени (ExamDto.timeLimitMin) —
  // считает сервер при старте, часам телефона не верим (ТЗ 4.4, п.7).
  @Prop({ type: Date, required: false })
  deadlineAt?: Date;

  @Prop({ type: Date, required: false })
  submittedAt?: Date;

  // Сдано не человеком, а временем (дедлайн истёк раньше, чем ученик нажал
  // «Сдать») — ТЗ 4.4, п.7.
  @Prop({ type: Boolean, default: false })
  expired!: boolean;
}

export const ExamAttemptSchema = SchemaFactory.createForClass(ExamAttemptRecord);
// Идемпотентность старта и лимит попыток (ТЗ 4.4, п.2–3): второй insert с
// той же тройкой — гонка двух кликов или двух тиков, не вторая попытка.
ExamAttemptSchema.index({ examId: 1, userId: 1, attemptNo: 1 }, { unique: true });
// Список ученика («Экзамены», кабинет — следующий слой) и его же фильтр по статусу.
ExamAttemptSchema.index({ userId: 1, status: 1 });
// Очередь проверки учителя (слой 4.6): что сдано и когда, недавнее сверху.
ExamAttemptSchema.index({ status: 1, submittedAt: -1 });
// Доступ ученика к картинке варианта — по снимку его попытки (ADR-0035).
ExamAttemptSchema.index({ userId: 1, imageIds: 1 });
// Доступ ученика к видео вопроса/варианта — тем же приёмом (ADR-0133).
ExamAttemptSchema.index({ userId: 1, videoIds: 1 });

export const EXAM_ATTEMPT_FIELD_POLICY: FieldPolicy = {
  examTitle: enc,
  blocks: encJson,
  answers: encJson,
  status: plain('перечисление, нужно для выборок'),
};

/** Схема шифрования попытки — одна на все места чтения и записи
 * (ExamAttemptsService): читающий попытку мимо неё получит шифротекст вместо
 * снимка/ответов. */
export const EXAM_ATTEMPT_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_ATTEMPT_FIELD_POLICY);
