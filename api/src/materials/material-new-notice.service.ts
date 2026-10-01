// «Новый материал» — шаг тика планировщика (ADR-0162, п. 4). Учитель создаёт
// материал с галочкой «Сообщить ученикам», и запрос на этом заканчивается;
// момент лежит на материале (`announceAt`, MaterialsService.create), а ленту и
// push ученикам пишет этот шаг: создание не тормозит и не падает из-за чужой
// доставки, а сбой записи у одного человека догоняют тики в окне повторов
// (`LESSON_NOTICE_WINDOW_HOURS`) — тихий отказ рассылки самая дорогая ошибка
// (CLAUDE.md «Логи»).
//
// Ход тот же, что у шагов о занятии (LessonNoticeStep): получатели ищет общий
// `LessonRecipientsService` (активные ученики с включённым видом и их выбор
// занятий), «уже сообщили» — строка ленты под уникальным индексом
// (userId, kind, materialId), доставка — `insertRowAndPush`, где push уходит
// только тому, чей вызов строку вставил. Отличие — предмет: не занятие, а
// материал, и набор занятий у него свой (привязка и теги, material-audience.ts).
// Базовый класс шагов о занятии здесь не годится: он целиком про `PlanLesson`.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { insertRowAndPush } from '../lessons/lesson-notice-delivery';
import { existingRowKeys } from '../lessons/lesson-notice-queries';
import { LessonRecipientsService } from '../notifications/lesson-recipients.service';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { MaterialRecord } from './material.schema';
import {
  planMaterialNotices,
  type PlannedMaterialNotice,
} from './material-new-notice-plan';
import { findAnnouncedMaterials, MATERIAL_NEW_KIND } from './material-new-notice-queries';

export interface MaterialNoticeResult {
  /** Сколько строк ленты вставлено (а значит, людей, которым ушёл push). */
  notified: number;
}

@Injectable()
export class MaterialNewNoticeService {
  private readonly logger = new Logger(MaterialNewNoticeService.name);

  constructor(
    @InjectModel(MaterialRecord.name)
    private readonly materialModel: Model<MaterialRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
    private readonly lessonRecipients: LessonRecipientsService,
    private readonly pushSender: PushSenderService,
  ) {}

  async announce(now: DateTime): Promise<MaterialNoticeResult> {
    // Материалы первыми: обычный тик не находит ни одного и на этом заканчивается
    // одним запросом, без поиска получателей.
    const materials = await findAnnouncedMaterials(
      {
        materialModel: this.materialModel,
        lessonModel: this.lessonModel,
        classModel: this.classModel,
      },
      now,
    );
    if (materials.length === 0) return { notified: 0 };
    const { recipients, prefs } = await this.lessonRecipients.findFor(MATERIAL_NEW_KIND);
    if (recipients.length === 0) return { notified: 0 };
    const existing = await existingRowKeys(this.notificationModel, {
      kind: MATERIAL_NEW_KIND,
      idField: 'materialId',
      userIds: recipients.map((r) => r.id),
      ids: materials.map((m) => m.id),
    });

    const planned = planMaterialNotices({ materials, recipients, prefs, existing });
    const sent = await Promise.all(planned.map((item) => this.notifyOne(item, now)));
    return { notified: sent.filter(Boolean).length };
  }

  /** Один человек, один материал: строка ленты и push — `insertRowAndPush`. */
  private notifyOne(
    { userId, materialId, materialTitle }: PlannedMaterialNotice,
    now: DateTime,
  ): Promise<boolean> {
    return insertRowAndPush(
      { model: this.notificationModel, pushSender: this.pushSender, logger: this.logger },
      { userId, kind: MATERIAL_NEW_KIND, materialId, materialTitle },
      now,
      `Уведомление о материале ${materialId} для ${userId}`,
    );
  }
}
