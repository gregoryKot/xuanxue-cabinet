// Кому пишет бот (ADR-0015, docs/PLAN.md §6): учителя/помощники учителя/
// админы с telegramId, у кого есть активный личный канал (channels type
// telegram, target = String(telegramId)) — то есть кто нажал /start. Один
// источник для всех проактивных отправителей (предпросмотр, «Запись?»,
// ручные каналы, уведомления об ошибках) — CLAUDE.md «Одна механика — один
// компонент». `list()` — все подключённые (identity-проверки хендлеров: чей
// это callback/сообщение), `listFor(kind)` — те же люди, у кого вдобавок
// включён этот вид уведомления (ТЗ notifications-delivery.md §1): дефолт роли
// с личными переключениями поверх, одна выборка `notification_prefs` на весь
// список — не по человеку в цикле (NotificationPrefsService.getManyEnabled).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { NotificationKind, UserRole } from '@xuanxue/shared';
import { ChannelRecord } from '../channels/channel.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { UsersService } from '../users/users.service';

export interface TeacherChat {
  chatId: string;
  userId: string;
  name: string;
}

interface ActiveContact extends TeacherChat {
  roles: UserRole[];
}

// Ни одного чата — не ошибка (школа ещё не подключила бота), но и не должно
// тонуть в логе на каждом тике: раз в час, не на каждый тик — отдельным
// счётчиком на общий список и на каждый вид уведомления (один мог выключить
// только его, остальные не в счёт).
const EMPTY_WARN_INTERVAL_MIN = 60;

@Injectable()
export class TeacherChats {
  private readonly logger = new Logger(TeacherChats.name);
  private lastEmptyWarnAt: DateTime | null = null;
  private readonly lastEmptyDebugAtByKind = new Map<NotificationKind, DateTime>();

  constructor(
    private readonly usersService: UsersService,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    private readonly notificationPrefsService: NotificationPrefsService,
  ) {}

  async list(now: DateTime): Promise<TeacherChat[]> {
    const contacts = await this.activeContacts();
    // roles — только для listFor(); наружу list() отдаёт исходную форму
    // TeacherChat, не расширенную (иначе поле «протекает» в чужой контракт —
    // все вызывающие места собирают его через `.toEqual`/`.map` по трём полям).
    const chats = contacts.map(({ chatId, userId, name }) => ({ chatId, userId, name }));
    return this.warnIfEmpty(chats, now);
  }

  async listFor(kind: NotificationKind, now: DateTime): Promise<TeacherChat[]> {
    const contacts = await this.activeContacts();
    if (contacts.length === 0) return this.debugIfEmptyForKind([], now, kind);

    const enabledByUser = await this.notificationPrefsService.getManyEnabled(
      contacts.map((c) => ({ id: c.userId, roles: c.roles })),
    );
    // getManyEnabled по контракту кладёт в карту запись на каждый переданный
    // id (contacts — тот же список, что ушёл в вызов выше) — `as`, не `!`
    // и не `?? []`: настоящего `undefined` тут не бывает, а ветку на него
    // заводить незачем (CLAUDE.md «Код»: `!` — только с причиной).
    const chats = contacts
      .filter((c) => (enabledByUser.get(c.userId) as NotificationKind[]).includes(kind))
      .map(({ chatId, userId, name }) => ({ chatId, userId, name }));
    return this.debugIfEmptyForKind(chats, now, kind);
  }

  /** Общий первый шаг list()/listFor() — контакт с ролью (уже отфильтрован
   * UsersService.listTeacherContacts) и активным личным каналом. */
  private async activeContacts(): Promise<ActiveContact[]> {
    const contacts = await this.usersService.listTeacherContacts();
    if (contacts.length === 0) return [];

    const targets = contacts.map((c) => String(c.telegramId));
    const channels = await this.channelModel
      .find({ type: 'telegram', target: { $in: targets }, active: true }, { target: 1 })
      .lean<{ target: string }[]>();
    const activeTargets = new Set(channels.map((c) => c.target));

    return contacts
      .filter((c) => activeTargets.has(String(c.telegramId)))
      .map((c) => ({
        chatId: String(c.telegramId),
        userId: c.id,
        name: c.name,
        roles: c.roles,
      }));
  }

  private warnIfEmpty(chats: TeacherChat[], now: DateTime): TeacherChat[] {
    if (chats.length > 0) return chats;
    const dueForWarn =
      !this.lastEmptyWarnAt ||
      now.diff(this.lastEmptyWarnAt, 'minutes').minutes >= EMPTY_WARN_INTERVAL_MIN;
    if (dueForWarn) {
      this.lastEmptyWarnAt = now;
      this.logger.warn(
        'ни один учитель/помощник/админ не подключил бота (нет активного личного ' +
          'канала после /start) — уведомления и предпросмотр отправить некому.',
      );
    }
    return chats;
  }

  /** Пустой список для конкретного вида — не обязательно «бот ни у кого не
   * подключён» (это уже покрыл `warnIfEmpty`/`list`): могло быть, что все
   * подключённые именно этот вид выключили в «Уведомления» — легитимный
   * выбор человека, не сбой, поэтому debug, не warn (ТЗ
   * notifications-delivery.md §2: «шаг тика не падает»). */
  private debugIfEmptyForKind(
    chats: TeacherChat[],
    now: DateTime,
    kind: NotificationKind,
  ): TeacherChat[] {
    if (chats.length > 0) return chats;
    const last = this.lastEmptyDebugAtByKind.get(kind);
    const dueForLog =
      !last || now.diff(last, 'minutes').minutes >= EMPTY_WARN_INTERVAL_MIN;
    if (dueForLog) {
      this.lastEmptyDebugAtByKind.set(kind, now);
      this.logger.debug(
        `некому слать «${kind}»: либо бота никто не подключил, либо все, кто ` +
          'подключил, выключили этот вид в «Уведомления».',
      );
    }
    return chats;
  }
}
