// Материалы, привязанные к датам архива ученика (`GET /me/lessons/archive`,
// ADR-0056, раздел «Ученик видит привязку там, где ищет») — один запрос на
// весь список архива, не по одному на дату (N+1 здесь означал бы N запросов
// к Mongo на каждое открытие архива). Вырезание `access: 'staff'` (ADR-0058)
// работает тем же приёмом и на тех же функциях, что и
// MaterialsService.listForStudent — иначе служебный материал утекал бы
// ученику через архив, а не через библиотеку (ADR-0096, отменяет ADR-0048).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { MyMaterialDto } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { isMaterialHiddenFromStudent } from './material-access';
import { findMaterialClassTitles } from './material-classes.lookup';
import {
  decryptMaterial,
  toMyMaterialDto,
  type RawLeanMaterial,
} from './material.mapper';
import { MaterialRecord } from './material.schema';

/** Потолок join'а «материалы → все даты архива за один запрос» (CLAUDE.md
 * «API»: списки — всегда с лимитом, «дай всё» запрещён). Это не лимит на
 * дату (там материалов обычно единицы) и не лимит библиотеки — это защита от
 * очень длинного архива школы, который жила бы годами: при переполнении
 * выпадут материалы у самых старых дат в выборке, не ответ целиком. */
const LESSON_MATERIALS_JOIN_LIMIT = 500;

@Injectable()
export class LessonMaterialsService {
  constructor(
    @InjectModel(MaterialRecord.name) private readonly model: Model<MaterialRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  /** `isStaff` — тот же уже вычисленный признак роли, что у
   * MaterialsService.listForStudent (не объект пользователя целиком):
   * сервис решает по роли, не по личности. Возвращает материалы
   * сгруппированными по id даты — только по тем id, что пришли в `lessonIds`
   * (материал может ссылаться и на дату вне архива, её сюда не кладём). */
  async findByLessonIds(
    lessonIds: string[],
    isStaff: boolean,
  ): Promise<Map<string, MyMaterialDto[]>> {
    if (lessonIds.length === 0) return new Map();

    // Тот же фильтр запроса, что в listForStudent (ADR-0058): служебный
    // материал вырезается ещё в Mongo, не после выборки — иначе он съедал бы
    // место в LESSON_MATERIALS_JOIN_LIMIT вместо материалов ученика.
    const filter: Record<string, unknown> = isStaff
      ? { lessonIds: { $in: lessonIds } }
      : { lessonIds: { $in: lessonIds }, access: { $ne: 'staff' } };

    const docs = await this.model
      .find(filter)
      // Свежие первыми — тот же порядок, что в библиотеке
      // (MaterialsService.list/listForStudent).
      .sort({ createdAt: -1 })
      .limit(LESSON_MATERIALS_JOIN_LIMIT)
      .lean<RawLeanMaterial[]>();

    const classTitleById = await findMaterialClassTitles(
      this.classModel,
      docs.map((doc) => doc.classIds),
    );
    const requestedIds = new Set(lessonIds);

    const byLessonId = new Map<string, MyMaterialDto[]>();
    for (const doc of docs) {
      const decrypted = decryptMaterial(doc);
      // Страховка на случай потерянного фильтра (ADR-0096 «Решение»): та же
      // проверка ещё раз, после расшифровки — действует и в архиве, ровно
      // как в библиотеке, иначе служебный материал утекал бы через «Архив
      // занятий», а не через «Материалы».
      if (isMaterialHiddenFromStudent({ access: decrypted.access, isStaff })) continue;
      const dto = toMyMaterialDto(decrypted, classTitleById);
      for (const lessonId of decrypted.lessonIds) {
        const key = lessonId.toString();
        if (!requestedIds.has(key)) continue;
        const existing = byLessonId.get(key);
        if (existing) existing.push(dto);
        else byLessonId.set(key, [dto]);
      }
    }
    return byLessonId;
  }
}
