// CRUD библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047) —
// данные школы (ADR-0010): список общий для всего штата, доступ по роли
// проверяет MaterialsController. `listForStudent` — тот же список глазами
// ученика (MyMaterialsController), без фильтра по классу или виду: у
// ученика групп нет, фильтровать вход в библиотеку нечем (ADR-0047). Слой
// 3.4 (ADR-0048) добавил сюда рубильник школы: `isMaterialLocked` решает,
// закрыт ли конкретный материал, settings читаются тем же SettingsService,
// что и остальные потребители (auth.controller.ts, broadcast-planner).
// `access: 'staff'` (ADR-0058) не закрывается постфактум, а вырезается
// фильтром запроса — иначе служебные материалы съедали бы лимит списка.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MATERIAL_NOT_FOUND_MESSAGE,
  MATERIALS_LIMIT_DEFAULT,
  MY_MATERIALS_LIMIT_DEFAULT,
  normalizeTags,
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
import { SettingsService } from '../settings/settings.service';
import { encryptRecord } from '../utils/encryption';
import { isMaterialLocked } from './material-access';
import { findMaterialClassTitles } from './material-classes.lookup';
import {
  decryptMaterial,
  toMaterialDto,
  toMyMaterialDto,
  type RawLeanMaterial,
} from './material.mapper';
import { MATERIAL_ENCRYPT_SCHEMA, MaterialRecord } from './material.schema';
import { buildMaterialsFilter } from './materials.queries';

const NOT_FOUND_MESSAGE = MATERIAL_NOT_FOUND_MESSAGE;

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(MaterialRecord.name) private readonly model: Model<MaterialRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    private readonly settingsService: SettingsService,
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
        lessonIds: input.lessonIds ?? [],
        access: input.access ?? 'all',
        // Нормализация здесь, не в DTO: список — фильтр (ADR-0058), опечатка
        // и дубль в базе разъехались бы с фильтром `tag` при чтении.
        tags: normalizeTags(input.tags ?? []),
        createdBy,
      },
      MATERIAL_ENCRYPT_SCHEMA,
    );
    const created = await this.model.create(payload);
    return this.getById(created._id.toString());
  }

  async update(id: string, input: UpdateMaterialInput): Promise<MaterialDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    // `tags` нормализуется, только если его прислали — иначе PATCH без
    // тегов случайно записал бы пустой нормализованный массив вместо
    // «поле не трогать» (splitUpdate/OptionalNotNull — тот же принцип).
    const patch =
      input.tags === undefined ? input : { ...input, tags: normalizeTags(input.tags) };
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: encryptRecord({ ...patch }, MATERIAL_ENCRYPT_SCHEMA) },
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

  /** `isStaff` — уже вычисленный `isStaffRole(user.roles)` из контроллера
   * (MyMaterialsController): сервис не должен решать по объекту пользователя
   * целиком, только по признаку роли (ADR-0048).
   *
   * `staff`-материал ученику не приходит вовсе — фильтр запроса Mongo
   * (`access: { $ne: 'staff' }`), а не отбрасывание после выборки: иначе
   * служебные материалы съедали бы лимит списка (ADR-0058). Штат видит всё,
   * фильтра для него нет. */
  async listForStudent(
    query: ListMyMaterialsQuery,
    isStaff: boolean,
  ): Promise<MyMaterialDto[]> {
    const filter: Record<string, unknown> = isStaff ? {} : { access: { $ne: 'staff' } };
    const [docs, settings] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(query.limit ?? MY_MATERIALS_LIMIT_DEFAULT)
        .lean<RawLeanMaterial[]>(),
      this.settingsService.get(),
    ]);
    const classTitleById = await findMaterialClassTitles(
      this.classModel,
      docs.map((doc) => doc.classIds),
    );
    return docs.map((doc) => {
      const decrypted = decryptMaterial(doc);
      const locked = isMaterialLocked({
        access: decrypted.access,
        paidAccessEnabled: settings.materialsPaidAccess,
        isStaff,
      });
      return toMyMaterialDto(decrypted, classTitleById, locked);
    });
  }

  private async getById(id: string): Promise<MaterialDto> {
    assertObjectId(id, NOT_FOUND_MESSAGE);
    const doc = await this.model.findById(id).lean<RawLeanMaterial>();
    if (!doc) throw new NotFoundError(NOT_FOUND_MESSAGE);
    return toMaterialDto(decryptMaterial(doc));
  }
}
