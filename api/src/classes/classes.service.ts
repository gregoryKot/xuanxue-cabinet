// CRUD занятий (данные школы, ADR-0010: доступ по роли, не по владельцу).
// Инкапсулирует шифрование секретов (zoomLink/zoomPassword, CLAUDE.md
// «Данные», чеклист коллекции) и id субдокументов правил расписания —
// контроллер только валидирует тело и зовёт эти методы.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type Types } from 'mongoose';
import type {
  ClassDto,
  CreateClassInput,
  ListClassesQuery,
  UpdateClassInput,
} from '@xuanxue/shared';
import {
  CLASS_NOT_FOUND_MESSAGE,
  LIST_LIMIT_DEFAULT,
  NULLABLE_CLASS_FIELDS,
} from '@xuanxue/shared';
import { ChannelRecord } from '../channels/channel.schema';
import { ConflictError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import { LessonRecord } from '../lessons/lesson.schema';
import { MaterialRecord } from '../materials/material.schema';
import { detachMaterialReference } from '../materials/materials.queries';
import { assertLeaderIdIfProvided } from '../users/assert-teacher';
import { UserRecord } from '../users/user.schema';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from './class.schema';
import { toClassDto, type LeanClass } from './class.mapper';
import { mapRules } from './classes.update';

const NOT_FOUND_MESSAGE = CLASS_NOT_FOUND_MESSAGE;
const HAS_LESSONS_MESSAGE =
  'У этого занятия уже есть даты занятий. Выключите его вместо удаления.';

@Injectable()
export class ClassesService {
  constructor(
    @InjectModel(ClassRecord.name) private readonly model: Model<ClassRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    @InjectModel(MaterialRecord.name)
    private readonly materialModel: Model<MaterialRecord>,
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
    return docs.map((doc) => toClassDto(decryptRecord(doc, CLASS_ENCRYPT_SCHEMA)));
  }

  async getById(id: string): Promise<ClassDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<LeanClass>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toClassDto(decryptRecord(doc, CLASS_ENCRYPT_SCHEMA));
  }

  async create(input: CreateClassInput): Promise<ClassDto> {
    await assertLeaderIdIfProvided(this.userModel, input.leaderId);
    const { rules, ...rest } = input;
    const payload: Record<string, unknown> = { ...rest };
    if (rules !== undefined) payload.rules = mapRules(rules);
    // channelIds не передан учителем (undefined, не []) — занятие подписывается
    // на все активные Telegram-каналы по умолчанию. Иначе класс, созданный
    // ПОСЛЕ подключения бота (docs/adr/0015 — «чат сам становится каналом»
    // только в момент upsertTelegramChat), получал бы channelIds: [], и
    // каждая ссылка на занятие молча отменялась бы «у класса нет каналов
    // рассылки». Явный [] или список от учителя — его выбор, ничего не
    // подставляем (та же логика — в SeedService.importClasses, который зовёт
    // этот же create()).
    if (payload.channelIds === undefined) {
      payload.channelIds = await this.defaultTelegramChannelIds();
    }
    // CreateClassDto (implements CreateClassInput) уже проверен ValidationPipe —
    // форма payload совпадает с ClassRecord, spread просто не виден TS.
    const created = await this.model.create(encryptRecord(payload, CLASS_ENCRYPT_SCHEMA));
    return this.getById(created._id.toString());
  }

  private async defaultTelegramChannelIds(): Promise<string[]> {
    // Личный канал ученика (broadcastEligible: false, ADR-0027) сюда не
    // попадает: занятие не должно получить получателем рассылки чей-то
    // личный чат только потому, что он тоже type: telegram.
    const docs = await this.channelModel
      .find({ type: 'telegram', active: true, broadcastEligible: { $ne: false } })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>();
    return docs.map((doc) => doc._id.toString());
  }

  async update(id: string, input: UpdateClassInput): Promise<ClassDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    await assertLeaderIdIfProvided(this.userModel, input.leaderId);
    const { rules, ...rest } = input;
    const { $set, $unset } = splitUpdate(rest, NULLABLE_CLASS_FIELDS);
    if (rules !== undefined) $set.rules = mapRules(rules);

    const update: UpdateCommand = { $set: encryptRecord($set, CLASS_ENCRYPT_SCHEMA) };
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const doc = await this.model
      .findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
      .lean<LeanClass>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toClassDto(decryptRecord(doc, CLASS_ENCRYPT_SCHEMA));
  }

  // Отвязка от materials.classIds — дыра, которая была до ADR-0056: класс
  // без дат занятий удалялся, а материалы школы продолжали ссылаться на
  // пропавший id (ADR-0047 «Последствия»). Тот же приём, что у
  // LessonsService.remove: после удаления, не до.
  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const hasLessons = await this.lessonModel.exists({ classId: id });
    if (hasLessons) throw new ConflictError(HAS_LESSONS_MESSAGE);
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
    await detachMaterialReference(this.materialModel, 'classIds', id);
  }
}
