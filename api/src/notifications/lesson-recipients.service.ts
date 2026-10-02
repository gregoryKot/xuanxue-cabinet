// Кому шаг тика о занятии вообще может писать: активные ученики, у которых вид
// включён, и их выбор «о каких занятиях» (ADR-0162). Одно место для шагов —
// «Занятие скоро» (LessonReminderService, ADR-0135), «Занятие отменено» и
// «Запись занятия» (LessonNoticeStep), «Новый материал» (MaterialNewNoticeService):
// без него поиск получателей расходился бы между ними на первой же правке
// (CLAUDE.md «Одна механика — один компонент»). Решение «о каком именно занятии»
// остаётся за шагом: он знает занятие и сверяет его класс с выбором человека
// (`isLessonInScope`); материал сверяет набор своих занятий (`isMaterialInScope`).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { NotificationKind } from '@xuanxue/shared';
import { listActiveStudents } from '../users/list-active-students';
import { UserRecord } from '../users/user.schema';
import { LessonScopeService, type LessonPrefs } from './lesson-scope.service';
import { NotificationPrefsService } from './notification-prefs.service';

export interface LessonRecipients {
  recipients: { id: string }[];
  /** Выбор каждого получателя; ключ есть у каждого (нет записи — «обо всех»
   * и «как в школе»). */
  prefs: Map<string, LessonPrefs>;
}

@Injectable()
export class LessonRecipientsService {
  constructor(
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    private readonly notificationPrefsService: NotificationPrefsService,
    private readonly lessonScopeService: LessonScopeService,
  ) {}

  /** Активные ученики (люди без единой роли, ADR-0026) и штат в режиме ученика
   * (ADR-0163 — владелец проверяет, что придёт ученику) с включённым `kind` и
   * их выбор занятий — по одной выборке на пачку людей, не на человека в цикле.
   * Нет подходящих — `recipients` пуст и `prefs` пуст: вторую выборку не
   * делаем. Модель пользователя — напрямую (UserModelModule), не через
   * UsersService (CLAUDE.md «Храповики»). */
  async findFor(kind: NotificationKind): Promise<LessonRecipients> {
    const students = await listActiveStudents(this.userModel, {
      includeStudentMode: true,
    });
    // Ученики без единой роли не дают ключа для defaultNotifications по
    // ролям — getManyEnabled принимает `roles: []` для каждого, тем же
    // приёмом, что defaultNotifications([]) отдаёт STUDENT_NOTIFICATIONS.
    // Штату в режиме ученика `[]` нужен тем более: его настоящие роли дали бы
    // штатные виды (post_draft…), а не ученические.
    const enabledByUser = await this.notificationPrefsService.getManyEnabled(
      students.map((s) => ({ id: s.id, roles: [] })),
    );
    const recipients = students.filter((s) => enabledByUser.get(s.id)?.includes(kind));
    const prefs = await this.lessonScopeService.getManyLessonPrefs(
      recipients.map((r) => r.id),
    );
    return { recipients, prefs };
  }
}
