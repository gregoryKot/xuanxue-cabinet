// CRUD библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047) —
// данные школы (ADR-0010): список общий для всего штата, доступ по роли
// проверяет MaterialsController. `listForStudent` — тот же список глазами
// ученика (MyMaterialsController), без фильтра по классу или виду: у
// ученика групп нет, фильтровать вход в библиотеку нечем (ADR-0047).
// `access: 'staff'` (ADR-0058) и материалы, которые нечем открыть
// (`STUDENT_OPENABLE_FILTER`, ADR-0134), не отбрасываются постфактум, а
// вырезаются фильтром запроса — иначе съедали бы лимит списка;
// `isMaterialHiddenFromStudent` после расшифровки — тот же отбор ещё раз, на
// случай потерянного фильтра (ADR-0096, отменяет ADR-0048: доступа по
// оплате больше нет, настройки школы здесь не нужны).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
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
import { ClassRecord } from '../classes/class.schema';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { visibleForStudent } from './material-access';
import { findMaterialClassTitles } from './material-classes.lookup';
import {
  decryptMaterial,
  toMaterialDto,
  toMyMaterialDto,
  type RawLeanMaterial,
} from './material.mapper';
import { MaterialRecord } from './material.schema';
import { buildMaterialCreateRecord } from './materials.create';
import { buildMaterialsFilter, STUDENT_OPENABLE_FILTER } from './materials.queries';
import { buildMaterialUpdateCommand } from './materials.update';

const NOT_FOUND_MESSAGE = MATERIAL_NOT_FOUND_MESSAGE;

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(MaterialRecord.name) private readonly model: Model<MaterialRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly orphans: StorageOrphansService,
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

  /** `now` — момент, от которого шаг тика сутки пробует объявить материал
   * (`announceAt`, только при `notifyStudents`, ADR-0162); без аргумента —
   * часы сервера, как берёт их остальной код через `DateTime.utc()`. */
  async create(
    input: CreateMaterialInput,
    createdBy: string,
    now: DateTime = DateTime.utc(),
  ): Promise<MaterialDto> {
    const created = await this.model.create(
      buildMaterialCreateRecord(input, createdBy, now),
    );
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateMaterialInput): Promise<MaterialDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOneAndUpdate({ _id: id }, buildMaterialUpdateCommand(input), {
        returnDocument: 'after',
      })
      .lean<RawLeanMaterial>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toMaterialDto(decryptMaterial(doc));
  }

  /** Файл материала уходит тем же действием (ADR-0057). Не удалось удалить
   * объект сейчас — он остался в журнале и уйдёт шагом планировщика
   * (ADR-0079); материал при этом удаляется в любом случае. */
  async remove(id: string, now: DateTime): Promise<void> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findOneAndDelete({ _id: id }).lean<RawLeanMaterial>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    if (doc.fileKey) await this.orphans.removeNow(doc.fileKey, now);
  }

  /** `isStaff` — уже вычисленный `isStaffRole(user.roles)` из контроллера
   * (MyMaterialsController): сервис не должен решать по объекту пользователя
   * целиком, только по признаку роли.
   *
   * `staff`-материал и материал, который нечем открыть (ни ссылки, ни файла
   * — `STUDENT_OPENABLE_FILTER`, ADR-0134), ученику не приходят вовсе —
   * фильтр запроса Mongo, а не отбрасывание после выборки: иначе съедали бы
   * лимит списка (ADR-0058). После расшифровки — тот же отбор доступа ещё
   * раз через `isMaterialHiddenFromStudent`: страховка на случай потерянного
   * фильтра (ADR-0096 «Решение»), не пометка «закрыто» — материал, которому
   * не повезло дважды пройти мимо фильтра, просто не попадает в список.
   * Штат видит всё, включая материал без файла и без ссылки — например,
   * только что созданный, которому файл ещё не долетел. */
  async listForStudent(
    query: ListMyMaterialsQuery,
    isStaff: boolean,
  ): Promise<MyMaterialDto[]> {
    const filter: Record<string, unknown> = isStaff
      ? {}
      : { access: { $ne: 'staff' }, ...STUDENT_OPENABLE_FILTER };
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit ?? MY_MATERIALS_LIMIT_DEFAULT)
      .lean<RawLeanMaterial[]>();
    const classTitleById = await findMaterialClassTitles(
      this.classModel,
      docs.map((doc) => doc.classIds),
    );
    return visibleForStudent(docs.map(decryptMaterial), isStaff).map((doc) =>
      toMyMaterialDto(doc, classTitleById),
    );
  }

  async getById(id: string): Promise<MaterialDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanMaterial>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toMaterialDto(decryptMaterial(doc));
  }
}
