// Личный чат с ботом (ADR-0015, docs/PLAN.md §6, §11 слой 4.7) — активный
// channels type telegram, target = String(telegramId), т.е. человек нажал
// /start. Два пула: `list()` — фиксированный STAFF_ROLES, кому бот вообще
// может писать (identity-проверки хендлеров SECURITY §3, меню штата;
// бухгалтеру оно не положено). `listFor(kind)` — кому АДРЕСОВАН вид: пул от
// `rolesWithNotification` (shared/src/notifications.ts), иначе `payments`
// (дефолт роли — только бухгалтер) не дошёл бы ни до кого; дальше как раньше
// — дефолт роли с переключениями, одна выборка `notification_prefs` на весь
// список (getManyEnabled). `chatFor(userId, kind)` — то же точечно для
// ОДНОГО человека любой роли, включая ученика: пустой результат — не авария.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { rolesWithNotification } from '@xuanxue/shared';
import type { NotificationKind, UserRole } from '@xuanxue/shared';
import { ChannelRecord } from '../channels/channel.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { UsersService, type UserLean } from '../users/users.service';

// Фиксированный пул list() — штат школы (заголовок файла).
const STAFF_ROLES: readonly UserRole[] = ['teacher', 'assistant', 'admin'];

export interface PersonalChat {
  chatId: string;
  userId: string;
  name: string;
}

interface ActiveContact extends PersonalChat {
  roles: UserRole[];
}

// Ни одного чата — не ошибка (школа ещё не подключила бота), но и не должно
// тонуть в логе на каждом тике: раз в час, не на каждый тик — отдельным
// счётчиком на общий список и на каждый вид уведомления (один мог выключить
// только его, остальные не в счёт).
const EMPTY_WARN_INTERVAL_MIN = 60;

@Injectable()
export class PersonalChats {
  private readonly logger = new Logger(PersonalChats.name);
  private lastEmptyWarnAt: DateTime | null = null;
  private readonly lastEmptyDebugAtByKind = new Map<NotificationKind, DateTime>();

  constructor(
    private readonly usersService: UsersService,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    private readonly notificationPrefsService: NotificationPrefsService,
  ) {}

  async list(now: DateTime): Promise<PersonalChat[]> {
    const contacts = await this.activeContacts(STAFF_ROLES);
    // roles — только для listFor(); наружу list() отдаёт исходную форму
    // PersonalChat, не расширенную (иначе поле «протекает» в чужой контракт —
    // все вызывающие места собирают его через `.toEqual`/`.map` по трём полям).
    const chats = contacts.map(({ chatId, userId, name }) => ({ chatId, userId, name }));
    return this.warnIfEmpty(chats, now);
  }

  async listFor(kind: NotificationKind, now: DateTime): Promise<PersonalChat[]> {
    const contacts = await this.activeContacts(rolesWithNotification(kind));
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

  /** Личный чат одного конкретного человека — если у него активный канал и
   * включён этот вид уведомления. В отличие от list()/listFor() не сверяется
   * со штатом школы: подходит и ученику. `null` — не ошибка (не подключил
   * бота или выключил вид, см. начало файла); пустой результат для одного
   * человека не логируется — не поломка канала. «Активный личный чат» —
   * общее условие с hasActiveChatFor, включая статус `active` (SECURITY §9,
   * ADR-0026, ADR-0036): заблокированному уведомления уходить не должны. */
  async chatFor(userId: string, kind: NotificationKind): Promise<PersonalChat | null> {
    const user = await this.usersService.findById(userId);
    // telegramId проверяем и здесь: из чужого await тип не сужается, а ниже
    // из него собирается chatId — иначе в нём молча оказалось бы «undefined».
    if (!user?.telegramId || !(await this.hasActiveChatFor(user))) return null;

    const prefs = await this.notificationPrefsService.get(userId, user.roles);
    if (!prefs.enabled.includes(kind)) return null;

    return { chatId: String(user.telegramId), userId: user.id, name: user.name };
  }

  /** Есть ли у человека активный личный чат — без проверки вида уведомления
   * (в отличие от chatFor). Принимает уже прочитанного пользователя — вызовы
   * оттуда, где он уже прочитан (AuthController.me, ADR-0042), не должны
   * читать его из БД второй раз. Статус `active` обязателен (SECURITY §9,
   * ADR-0026, ADR-0036) — тот же инвариант, что у chatFor. */
  async hasActiveChatFor(user: UserLean | null): Promise<boolean> {
    if (!user?.telegramId || user.status !== 'active') return false;

    const channel = await this.channelModel
      .findOne(
        { type: 'telegram', target: String(user.telegramId), active: true },
        { _id: 1 },
      )
      .lean();
    return !!channel;
  }

  /** То же по userId — для мест, где человек ещё не прочитан
   * (MailExamNotifier, ADR-0039): письмо-резерв уходит только тем, у кого
   * чата с ботом нет вовсе, а не тем, кто выключил один вид уведомления. */
  async hasActiveChat(userId: string): Promise<boolean> {
    return this.hasActiveChatFor(await this.usersService.findById(userId));
  }

  /** Общий первый шаг list()/listFor() — контакт с переданной ролью
   * (UsersService.listContactsWithRoles) и активным каналом. */
  private async activeContacts(roles: readonly UserRole[]): Promise<ActiveContact[]> {
    const contacts = await this.usersService.listContactsWithRoles(roles);
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

  private warnIfEmpty(chats: PersonalChat[], now: DateTime): PersonalChat[] {
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
    chats: PersonalChat[],
    now: DateTime,
    kind: NotificationKind,
  ): PersonalChat[] {
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
