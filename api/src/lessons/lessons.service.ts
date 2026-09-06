// CRUD дат занятий (данные школы, ADR-0010: доступ по роли, не по владельцу).
// Инкапсулирует шифрование секретов (zoomLinkOverride/zoomPasswordOverride/
// note, CLAUDE.md «Данные») — контроллер только валидирует тело и зовёт эти
// методы (образец — ClassesService). Подготовка тела create/addRecording —
// в lessons.create.ts/lessons.recording.ts, здесь не влезала бы в лимит.
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
import { LIST_LIMIT_MAX, NULLABLE_LESSON_FIELDS } from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { splitUpdate } from '../common/patch-update';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { ClassRecord } from '../classes/class.schema';
import { LESSON_FIELD_POLICY, LessonRecord } from './lesson.schema';
import { toLessonDto, type LeanLesson } from './lesson.mapper';
import { assertListWindow, parseUtcIso } from './lesson-dates';
import { buildCreatePayload } from './lessons.create';
import { assertHasRecordingSource, buildRecordingPush } from './lessons.recording';

const ENCRYPT_SCHEMA = encryptSchemaFrom(LESSON_FIELD_POLICY);
const LESSON_NOT_FOUND = 'Дата занятия не найдена. Обновите расписание.';
const CLASS_NOT_FOUND = 'Занятие не найдено. Обновите список.';
const CANNOT_DELETE_PLANNED = 'Эта дата из расписания: отмените занятие вместо удаления';

interface UpdateCommand {
  $set: Record<string, unknown>;
  $unset?: Record<string, ''>;
}

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
      throw new NotFoundError(CLASS_NOT_FOUND);
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
    return docs.map((doc) => toLessonDto(decryptRecord(doc, ENCRYPT_SCHEMA)));
  }

  async getById(id: string): Promise<LessonDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(LESSON_NOT_FOUND);
    const doc = await this.model.findById(id).lean<LeanLesson>();
    if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
    return toLessonDto(decryptRecord(doc, ENCRYPT_SCHEMA));
  }

  async create(input: CreateLessonInput): Promise<LessonDto> {
    const cls = await this.classModel
      .findById(input.classId, { rules: 1 })
      .lean<{ rules: { durationMin: number }[] } | null>();
    if (!cls) throw new NotFoundError(CLASS_NOT_FOUND);

    // Явный тип через спред, не LessonCreatePayload напрямую: encryptRecord
    // обобщён по T extends Record<string, unknown>, и конкретный интерфейс
    // без индексной сигнатуры в этот constraint не проходит (как в
    // ClassesService.create — там та же причина у payload).
    const payload: Record<string, unknown> = { ...buildCreatePayload(input, cls.rules) };
    const created = await this.model.create(encryptRecord(payload, ENCRYPT_SCHEMA));
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateLessonInput): Promise<LessonDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(LESSON_NOT_FOUND);
    const { startsAt, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_LESSON_FIELDS);
    // Перенос startsAt меняет только фактическое время начала — plannedAt
    // (identity слота для планировщика, см. lesson.schema.ts) не трогаем.
    if (startsAt !== undefined) {
      $set.startsAt = parseUtcIso(startsAt, 'startsAt').toJSDate();
    }

    const update: UpdateCommand = { $set: encryptRecord($set, ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const doc = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<LeanLesson>();
    if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
    return toLessonDto(decryptRecord(doc, ENCRYPT_SCHEMA));
  }

  // Только разовая дата удаляется целиком: у даты из расписания планировщик
  // сам решает её судьбу при следующем тике, вручную — только отмена.
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(LESSON_NOT_FOUND);
    const { deletedCount } = await this.model.deleteOne({
      _id: id,
      plannedAt: { $exists: false },
    });
    if (deletedCount > 0) return;
    const stillExists = await this.model.exists({ _id: id });
    if (stillExists) throw new ConflictError(CANNOT_DELETE_PLANNED);
    throw new NotFoundError(LESSON_NOT_FOUND);
  }

  async addRecording(id: string, input: AddRecordingInput): Promise<LessonDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(LESSON_NOT_FOUND);
    assertHasRecordingSource(input);

    const lesson = await this.model
      .findById(id, { classId: 1 })
      .lean<{ classId: Types.ObjectId } | null>();
    if (!lesson) throw new NotFoundError(LESSON_NOT_FOUND);

    const cls = await this.classModel
      .findById(lesson.classId, { title: 1 })
      .lean<{ title: string } | null>();
    // Рассылка записи здесь не создаётся — это задача сервиса рассылок
    // (следующий PR), здесь только сохранение.
    await this.model.updateOne(
      { _id: id },
      { $push: { recordings: buildRecordingPush(input, cls?.title ?? '') } },
    );
    return this.getById(id);
  }
}
