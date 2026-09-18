// CRUD библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047) —
// данные школы (ADR-0010): список общий для всего штата, доступ по роли
// проверяет MaterialsController. `listForStudent` — тот же список глазами
// ученика (MyMaterialsController), без фильтра по классу или виду: у
// ученика групп нет, фильтровать вход в библиотеку нечем (ADR-0047).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type Types } from 'mongoose';
import {
  MATERIAL_NOT_FOUND_MESSAGE,
  MATERIALS_LIMIT_DEFAULT,
  MY_MATERIALS_LIMIT_DEFAULT,
  type CreateMaterialInput,
  type ListMaterialsQuery,
  type ListMyMaterialsQuery,
  type MaterialDto,
  type MyMaterialDto,
  type UpdateMaterialInput,
} from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../classes/class.schema';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { decryptRecord, encryptRecord } from '../utils/encryption';
import {
  decryptMaterial,
  toMaterialDto,
  toMyMaterialDto,
  type RawLeanMaterial,
} from './material.mapper';
import { MATERIAL_ENCRYPT_SCHEMA, MaterialRecord } from './material.schema';
import { buildMaterialsFilter } from './materials.queries';

const NOT_FOUND_MESSAGE = MATERIAL_NOT_FOUND_MESSAGE;

/** Из класса библиотеке нужно одно название — `Pick` вместо всего документа,
 * тот же приём, что у RawLeanMyLessonClass (lessons/lesson-classes.lookup.ts):
 * иначе тип не проходит ограничение `T extends Record<string, unknown>` у
 * decryptRecord. */
type RawLeanMaterialClass = Pick<ClassRecord, 'title'> & { _id: Types.ObjectId };

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(MaterialRecord.name) private readonly model: Model<MaterialRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  /** Порядок — свежие материалы первыми (MaterialSchema.index({createdAt: -1})). */
  async list(query: ListMaterialsQuery): Promise<MaterialDto[]> {
    const filter = buildMaterialsFilter(query);
    if (filter === null) return [];
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit ?? MATERIALS_LIMIT_DEFAULT)
      .lean<RawLeanMaterial[]>();
    return docs.map((doc) => toMaterialDto(decryptMaterial(doc)));
  }

  async create(input: CreateMaterialInput, createdBy: string): Promise<MaterialDto> {
    const payload = encryptRecord(
      {
        title: input.title,
        url: input.url,
        kind: input.kind,
        classIds: input.classIds ?? [],
        access: input.access ?? 'all',
        createdBy,
      },
      MATERIAL_ENCRYPT_SCHEMA,
    );
    const created = await this.model.create(payload);
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateMaterialInput): Promise<MaterialDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: encryptRecord({ ...input }, MATERIAL_ENCRYPT_SCHEMA) },
        { returnDocument: 'after' },
      )
      .lean<RawLeanMaterial>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toMaterialDto(decryptMaterial(doc));
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
  }

  async listForStudent(query: ListMyMaterialsQuery): Promise<MyMaterialDto[]> {
    const docs = await this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(query.limit ?? MY_MATERIALS_LIMIT_DEFAULT)
      .lean<RawLeanMaterial[]>();
    const classTitleById = await this.findClassTitles(docs);
    return docs.map((doc) => toMyMaterialDto(decryptMaterial(doc), classTitleById));
  }

  /** Названия занятий одним запросом на весь список — ученику они нужны
   * подписью к материалу (ADR-0047), а `GET /classes` ему закрыт ролью.
   * Тот же приём `$in` + Map, что у findLessonClassesByIds
   * (lessons/lesson-classes.lookup.ts); своя функция, а не та: там из класса
   * достают ссылку Zoom и место, здесь — одно название. */
  private async findClassTitles(docs: RawLeanMaterial[]): Promise<Map<string, string>> {
    const ids = [...new Set(docs.flatMap((doc) => doc.classIds.map(String)))];
    if (ids.length === 0) return new Map();
    const classes = await this.classModel
      .find({ _id: { $in: ids } })
      .lean<RawLeanMaterialClass[]>();
    return new Map(
      classes.map((cls) => [
        cls._id.toString(),
        decryptRecord(cls, CLASS_ENCRYPT_SCHEMA).title,
      ]),
    );
  }

  private async getById(id: string): Promise<MaterialDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanMaterial>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toMaterialDto(decryptMaterial(doc));
  }
}
