// Список учителей для выбора ведущего — `GET /users/teachers` (docs/PLAN.md
// §6 п.2, аудит В4). Отдельный файл, не метод в UsersService: тот уже на
// пределе файла-храповика (CLAUDE.md «Храповики», как и у
// user-roles.service.ts). Роли здесь — только teacher/admin, не то же самое,
// что у UsersService.listTeacherContacts (тот с assistant — PersonalChats,
// помощник учителя пишет боту так же, как учитель): вести занятие как
// leaderId помощник пока не может, это выбор ведущего, а не контакт бота.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX, type TeacherOptionDto } from '@xuanxue/shared';
import { UserRecord } from './user.schema';

@Injectable()
export class TeachersService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /** Активные teacher/admin по алфавиту — список для select'а, а не «кто
   * недавно входил» (UserRolesService.list сортирует иначе, для экрана
   * «Люди»). Без ПДн (SECURITY §1): поля запроса — только name. */
  async listTeachers(): Promise<TeacherOptionDto[]> {
    const docs = await this.model
      .find({ roles: { $in: ['teacher', 'admin'] }, status: 'active' }, { name: 1 })
      .collation({ locale: 'ru' })
      .sort({ name: 1 })
      .limit(LIST_LIMIT_MAX)
      .lean<{ _id: Types.ObjectId; name: string }[]>();
    return docs.map((doc) => ({ id: doc._id.toString(), name: doc.name }));
  }
}
