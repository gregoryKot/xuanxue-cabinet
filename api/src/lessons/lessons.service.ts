// CRUD дат занятий (данные школы, ADR-0010: доступ по роли, не по владельцу).
// Инкапсулирует шифрование секретов (zoomLinkOverride/zoomPasswordOverride/
// note, CLAUDE.md «Данные») — контроллер только валидирует тело и зовёт эти
// методы (образец — ClassesService). Подготовка тела create/addRecording —
// в lessons.create.ts/lessons.recording.ts, одиночные запросы и тексты
// ошибок — в lessons.queries.ts.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  AddRecordingInput,
  CreateLessonInput,
  LessonDto,
  ListLessonsQuery,
  UpdateLessonInput,
} from '@xuanxue/shared';
import {
  CLASS_NOT_FOUND_MESSAGE,
  LIST_LIMIT_MAX,
  NULLABLE_LESSON_FIELDS,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from './lesson.schema';
import { toLessonDto, type LeanLesson } from './lesson.mapper';
import { assertListWindow, parseUtcIso } from './lesson-dates';
import { buildCreatePayload } from './lessons.create';
import {
  LESSON_ENCRYPT_SCHEMA,
  LESSON_NOT_FOUND,
  assertDurationEditable,
  assertLessonId,
  deleteOneOffLesson,
  findClassTitle,
  findLessonDto,
} from './lessons.queries';
import {
  assertHasRecordingSource,
  buildRecordingDuplicateConditions,
  buildRecordingPush,
} from './lessons.recording';

@Injectable()
export class LessonsService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async list(query: ListLessonsQuery): Promise<LessonDto[]> {
    const from = parseUtcIso(query.from, 'from');
    const to = parseUtcIso(query.to, 'to');
    assertListWindow(from, to);
    if (query.classId !== undefined && !Types.ObjectId.isValid(query.classId)) {
      throw new NotFoundError(CLASS_NOT_FOUND_MESSAGE);
    }

    const filter: Record<string, unknown> = {
      startsAt: { $gte: from.toJSDate(), $lt: to.toJSDate() },
    };
    if (query.classId !== undefined) filter.classId = query.classId;

    const docs = await this.model
      .find(filter)
      .sort({ startsAt: 1 })
      // По умолчанию максимум, не LIST_LIMIT_DEFAULT: экран «Планирование»
      // показывает весь горизонт целиком (30 слотов × 4 недели < 200).
      .limit(query.limit ?? LIST_LIMIT_MAX)
      .lean<LeanLesson[]>();
    return docs.map((doc) => toLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA)));
  }

  getById(id: string): Promise<LessonDto> {
    return findLessonDto(this.model, id);
  }

  async create(input: CreateLessonInput): Promise<LessonDto> {
    const cls = await this.classModel
      .findById(input.classId, { rules: 1 })
      .lean<{ rules?: { durationMin: number }[] } | null>();
    if (!cls) throw new NotFoundError(CLASS_NOT_FOUND_MESSAGE);

    // Спред в Record: encryptRecord обобщён по T extends Record<string, unknown>,
    // интерфейс без индексной сигнатуры туда не проходит (как в ClassesService).
    // `rules ?? []` — документ без поля не должен уронить подбор длительности.
    const payload: Record<string, unknown> = {
      ...buildCreatePayload(input, cls.rules ?? []),
    };
    const created = await this.model.create(
      encryptRecord(payload, LESSON_ENCRYPT_SCHEMA),
    );
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateLessonInput): Promise<LessonDto> {
    assertLessonId(id);
    if (input.durationMin !== undefined) await assertDurationEditable(this.model, id);

    const { startsAt, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_LESSON_FIELDS);
    // Перенос startsAt меняет только фактическое время начала — plannedAt
    // (identity слота для планировщика, см. lesson.schema.ts) не трогаем.
    if (startsAt !== undefined) {
      $set.startsAt = parseUtcIso(startsAt, 'startsAt').toJSDate();
    }

    const update: UpdateCommand = { $set: encryptRecord($set, LESSON_ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const doc = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<LeanLesson>();
    if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
    return toLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA));
  }

  remove(id: string): Promise<void> {
    return deleteOneOffLesson(this.model, id);
  }

  async addRecording(id: string, input: AddRecordingInput): Promise<LessonDto> {
    assertLessonId(id);
    assertHasRecordingSource(input);

    const lesson = await this.model
      .findById(id, { classId: 1 })
      .lean<{ classId: Types.ObjectId } | null>();
    if (!lesson) throw new NotFoundError(LESSON_NOT_FOUND);

    const title = await findClassTitle(this.classModel, lesson.classId);
    // Повтор того же url/telegramFileId (бот присылает запрос заново после
    // таймаута ответа) не должен плодить вторую запись — идемпотентность по
    // явному ключу (CLAUDE.md «API»), не по флагу в памяти. Рассылка записи
    // здесь не создаётся — это задача сервиса рассылок (следующий PR), здесь
    // только сохранение.
    await this.model.updateOne(
      { _id: id, $nor: buildRecordingDuplicateConditions(input) },
      { $push: { recordings: buildRecordingPush(input, title) } },
    );
    return this.getById(id);
  }
}
