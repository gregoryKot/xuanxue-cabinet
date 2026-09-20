// CRUD дат занятий (данные школы, ADR-0010: доступ по роли, не по владельцу).
// Инкапсулирует шифрование секретов (CLAUDE.md «Данные») — контроллер только валидирует
// тело и зовёт эти методы (образец — ClassesService). Подготовка тела create/addRecording
// — lessons.create.ts/lessons.recording.ts, запросы и тексты ошибок — lessons.queries.ts.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  CLASS_NOT_FOUND_MESSAGE,
  LIST_LIMIT_MAX,
  type AddRecordingInput,
  type CreateLessonInput,
  type LessonDto,
  type ListLessonsQuery,
  type UpdateLessonInput,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import { RecordingBroadcastService } from '../broadcasts/recording-broadcast.service';
import { ClassRecord } from '../classes/class.schema';
import { MaterialRecord } from '../materials/material.schema';
import { detachMaterialReference } from '../materials/materials.queries';
import { assertLeaderIdIfProvided } from '../users/assert-teacher';
import { UserRecord } from '../users/user.schema';
import { findLinkBroadcastStatusByLessonId } from './lesson-broadcast-status';
import { LESSON_ENCRYPT_SCHEMA, LessonRecord } from './lesson.schema';
import { toLessonDto, type LeanLesson } from './lesson.mapper';
import { assertListWindow, parseUtcIso } from './lesson-dates';
import { buildCreatePayload } from './lessons.create';
import {
  LESSON_NOT_FOUND,
  assertDurationEditable,
  assertLessonId,
  buildLessonsFilter,
  deleteOneOffLesson,
  findClassTitle,
  findLessonDto,
} from './lessons.queries';
import {
  assertHasRecordingSource,
  assertValidRecordingUrl,
  buildRecordingDuplicateConditions,
  buildRecordingPush,
} from './lessons.recording';
import { buildUpdateCommand } from './lessons.update';

@Injectable()
export class LessonsService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly recordingBroadcast: RecordingBroadcastService,
    private readonly lessonLinkRebuild: LessonLinkRebuildService,
    @InjectModel(BroadcastRecord.name) private readonly broadcast: Model<BroadcastRecord>,
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    @InjectModel(MaterialRecord.name)
    private readonly materialModel: Model<MaterialRecord>,
  ) {}

  async list(query: ListLessonsQuery): Promise<LessonDto[]> {
    const from = parseUtcIso(query.from, 'from');
    const to = parseUtcIso(query.to, 'to');
    assertListWindow(from, to);
    if (query.classId !== undefined && !Types.ObjectId.isValid(query.classId)) {
      throw new NotFoundError(CLASS_NOT_FOUND_MESSAGE);
    }
    const filter = buildLessonsFilter(query, from, to);
    const docs = await this.model
      .find(filter)
      .sort({ startsAt: 1 })
      // По умолчанию максимум, не LIST_LIMIT_DEFAULT: экран «Планирование»
      // показывает весь горизонт целиком (30 слотов × 4 недели < 200).
      .limit(query.limit ?? LIST_LIMIT_MAX)
      .lean<LeanLesson[]>();
    // Статус ссылки на карточке (docs/PLAN.md §6 п.3, см. lesson-broadcast-status.ts).
    const statusByLessonId = await findLinkBroadcastStatusByLessonId(
      this.broadcast,
      docs.map((doc) => doc._id),
    );
    return docs.map((doc) => {
      const status = statusByLessonId.get(doc._id.toString());
      return toLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA), status);
    });
  }

  getById(id: string): Promise<LessonDto> {
    return findLessonDto(this.model, id);
  }

  async create(input: CreateLessonInput): Promise<LessonDto> {
    const cls = await this.classModel
      .findById(input.classId, { rules: 1 })
      .lean<{ rules?: { durationMin: number }[] } | null>();
    if (!cls) throw new NotFoundError(CLASS_NOT_FOUND_MESSAGE);
    // Спред в Record: интерфейс без индексной сигнатуры не подходит encryptRecord (как в
    // ClassesService); rules ?? [] — документ без поля не роняет подбор длительности.
    const payload: Record<string, unknown> = {
      ...buildCreatePayload(input, cls.rules ?? []),
    };
    const created = await this.model.create(
      encryptRecord(payload, LESSON_ENCRYPT_SCHEMA),
    );
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateLessonInput, now: DateTime): Promise<LessonDto> {
    assertLessonId(id);
    if (input.durationMin !== undefined) await assertDurationEditable(this.model, id);
    await assertLeaderIdIfProvided(this.userModel, input.leaderId);
    const doc = await this.model
      .findOneAndUpdate({ _id: id }, buildUpdateCommand(input), {
        returnDocument: 'after',
      })
      .lean<LeanLesson>();
    if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
    // Перенос приводит ещё не ушедшую рассылку в соответствие (ADR-0054);
    // сбой не откатывает состоявшийся PATCH — rebuild логирует его сам.
    if (input.startsAt !== undefined) await this.lessonLinkRebuild.rebuild(doc._id, now);
    return toLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA));
  }

  // Отвязка от materials.lessonIds после удаления, не до: если удаление
  // упадёт (дата из расписания, ConflictError), привязка должна остаться
  // как была (ADR-0056 «Последствия»).
  async remove(id: string): Promise<void> {
    await deleteOneOffLesson(this.model, id);
    await detachMaterialReference(this.materialModel, 'lessonIds', id);
  }

  async addRecording(
    id: string,
    input: AddRecordingInput,
    now: DateTime,
  ): Promise<LessonDto> {
    assertLessonId(id);
    assertHasRecordingSource(input);
    assertValidRecordingUrl(input.url);
    const lesson = await this.model
      .findById(id, { classId: 1 })
      .lean<{ _id: Types.ObjectId; classId: Types.ObjectId } | null>();
    if (!lesson) throw new NotFoundError(LESSON_NOT_FOUND);
    const title = await findClassTitle(this.classModel, lesson.classId);
    const recording = buildRecordingPush(input, title);
    // Повтор url/file_id не плодит вторую запись ($nor, lessons.recording.ts).
    await this.model.updateOne(
      { _id: id, $nor: buildRecordingDuplicateConditions(input) },
      { $push: { recordings: recording } },
    );
    // Зовём всегда, не только при $push: идемпотентность — на уникальном индексе
    // (lessonId, recordingKey), не на факте изменения (docs/PLAN.md §6 «Записи»).
    await this.recordingBroadcast.ensureForRecording(lesson._id, recording, now);
    return this.getById(id);
  }
}
