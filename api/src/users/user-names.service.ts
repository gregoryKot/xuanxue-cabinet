// Имена пользователей по id, пачкой — карточка проверки и список попыток
// экзамена показывают учителю имя ученика вместо голого userId (слой 4.6).
// Отдельный файл, не метод в UsersService: тот уже на пределе файла-храповика
// (CLAUDE.md «Храповики», тот же приём, что у teachers.service.ts).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { UserRecord } from './user.schema';

@Injectable()
export class UserNamesService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /** Один запрос на весь список (не N+1). Невалидный ObjectId в `ids` —
   * просто пропущен, не 500 (тот же приём, что у `assertObjectId`, но здесь
   * молчаливый фильтр: недостающее имя в карточке — не ошибка вызывающего).
   * Пустой вход — пустая Map без обращения к базе. Лимит — как у
   * `UsersService.listContactsWithRoles`: «дай всё» без ограничения запрещено,
   * даже для внутреннего использования. */
  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) return new Map();

    const docs = await this.model
      .find({ _id: { $in: validIds } }, { name: 1 })
      .limit(LIST_LIMIT_MAX)
      .lean<{ _id: Types.ObjectId; name: string }[]>();
    return new Map(docs.map((doc) => [doc._id.toString(), doc.name]));
  }
}
