// CRUD занятий (данные школы, ADR-0010: доступ по роли, не по владельцу).
// Инкапсулирует шифрование секретов (zoomLink/zoomPassword, CLAUDE.md
// «Данные», чеклист коллекции) и id субдокументов правил расписания —
// контроллер только валидирует тело и зовёт эти методы.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  ClassDto,
  CreateClassInput,
  ListClassesQuery,
  UpdateClassInput,
} from '@xuanxue/shared';
import { LIST_LIMIT_DEFAULT, NULLABLE_CLASS_FIELDS } from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { LessonRecord } from '../lessons/lesson.schema';
import { CLASS_FIELD_POLICY, ClassRecord } from './class.schema';
import { toClassDto, type LeanClass } from './class.mapper';
import { mapRules, splitUpdate } from './classes.update';

const ENCRYPT_SCHEMA = encryptSchemaFrom(CLASS_FIELD_POLICY);
const NOT_FOUND_MESSAGE = 'Занятие не найдено. Обновите список.';
const HAS_LESSONS_MESSAGE =
  'У этого занятия уже есть даты в расписании. Выключите его вместо удаления.';

interface UpdateCommand {
  $set: Record<string, unknown>;
  $unset?: Record<string, ''>;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectModel(ClassRecord.name) private readonly model: Model<ClassRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
  ) {}

  async list(query: ListClassesQuery): Promise<ClassDto[]> {
    const filter = query.active === undefined ? {} : { active: query.active };
    const docs = await this.model
      .find(filter)
      // Без collation Mongo сортирует по кодам символов — «Яблоко» ушло бы
      // выше «арбуз» (заглавная Я < строчная а по коду). locale: 'ru' — по
      // алфавиту, без учёта регистра.
      .collation({ locale: 'ru' })
      .sort({ title: 1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<LeanClass[]>();
    return docs.map((doc) => toClassDto(decryptRecord(doc, ENCRYPT_SCHEMA)));
  }

  async getById(id: string): Promise<ClassDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<LeanClass>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toClassDto(decryptRecord(doc, ENCRYPT_SCHEMA));
  }

  // leaderId принимается как есть: проверка, что это существующий учитель,
  // появится вместе с экраном выбора ведущего.
  async create(input: CreateClassInput): Promise<ClassDto> {
    const { rules, ...rest } = input;
    const payload: Record<string, unknown> = { ...rest };
    if (rules !== undefined) payload.rules = mapRules(rules);
    // CreateClassDto (implements CreateClassInput) уже проверен ValidationPipe —
    // форма payload совпадает с ClassRecord, spread просто не виден TS.
    const created = await this.model.create(encryptRecord(payload, ENCRYPT_SCHEMA));
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateClassInput): Promise<ClassDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const { rules, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_CLASS_FIELDS);
    if (rules !== undefined) $set.rules = mapRules(rules);

    const update: UpdateCommand = { $set: encryptRecord($set, ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const doc = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<LeanClass>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toClassDto(decryptRecord(doc, ENCRYPT_SCHEMA));
  }

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const hasLessons = await this.lessonModel.exists({ classId: id });
    if (hasLessons) throw new ConflictError(HAS_LESSONS_MESSAGE);
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
  }
}
