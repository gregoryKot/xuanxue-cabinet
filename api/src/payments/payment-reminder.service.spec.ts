// Против настоящей Mongo (CLAUDE.md «Тесты», образец —
// lesson-reminder.service.spec.ts): upsert документа оплаты, claim по
// reminderSentAt, переключатель вида через настоящий NotificationPrefsService
// и read-after-write строки ленты. Фейки — только внешние границы: чат и
// отправка в Telegram, push, имя бота, настройки школы (ADR-0150).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import {
  DEFAULT_PAYMENT_REMINDER,
  type PaymentReminderSettings,
  type SettingsDto,
} from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import {
  NotificationRecord,
  NotificationSchema,
} from '../notifications/notification.schema';
import type { PushSenderService } from '../push/push-sender.service';
import type { SettingsService } from '../settings/settings.service';
import type { PersonalChats } from '../telegram/personal-chats';
import type { TelegramBotService } from '../telegram/telegram-bot.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { PaymentRecord, PaymentSchema } from './payment.schema';
import { PAYMENT_REMINDER_BATCH_LIMIT } from './payment-reminder-candidates';
import { PaymentReminderService } from './payment-reminder.service';

const TZ = 'Asia/Jerusalem';
// 5 сентября 2026, 10:00 в Израиле (UTC+3).
const NOW = DateTime.fromISO('2026-09-05T07:00:00Z', { zone: 'utc' });
const BOT_NAME = 'xuanxue_bot';
const PAYMENT_CONTACT = 'Маше @marievyazova';

function utc(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' });
}

describe('PaymentReminderService.remind (ADR-0150)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let paymentModel: Model<PaymentRecord>;
  let userModel: Model<UserRecord>;
  let notificationModel: Model<NotificationRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    paymentModel = connection.model<PaymentRecord>(PaymentRecord.name, PaymentSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    notificationModel = connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    prefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
      NotificationPrefsSchema,
    );
    await Promise.all([paymentModel.syncIndexes(), notificationModel.syncIndexes()]);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      paymentModel.deleteMany({}),
      userModel.deleteMany({}),
      notificationModel.deleteMany({}),
      prefsModel.deleteMany({}),
    ]);
  });

  interface Harness {
    service: PaymentReminderService;
    sendMessage: jest.Mock;
    sendToUser: jest.Mock;
    chatFor: jest.Mock;
    prefs: NotificationPrefsService;
  }

  interface BuildOptions {
    reminder?: Partial<PaymentReminderSettings>;
    /** userId → chatId; кого нет в карте, у того личного чата нет. */
    chats?: Map<string, string>;
    botUsername?: string | undefined;
    sendResult?: boolean;
  }

  function build(options: BuildOptions = {}): Harness {
    const reminder = { ...DEFAULT_PAYMENT_REMINDER, enabled: true, ...options.reminder };
    const settings = {
      get: () =>
        Promise.resolve({
          tz: TZ,
          paymentReminder: reminder,
          paymentContact: PAYMENT_CONTACT,
        } as SettingsDto),
    } as unknown as SettingsService;
    const chats = options.chats ?? new Map<string, string>();
    const chatFor = jest.fn((userId: string) =>
      Promise.resolve(
        chats.has(userId)
          ? { chatId: chats.get(userId) ?? '', userId, name: 'Имя' }
          : null,
      ),
    );
    const sendMessage = jest.fn().mockResolvedValue(options.sendResult ?? true);
    const sendToUser = jest.fn().mockResolvedValue(1);
    const botUsername = 'botUsername' in options ? options.botUsername : BOT_NAME;
    const prefs = new NotificationPrefsService(prefsModel);
    const service = new PaymentReminderService(
      paymentModel,
      userModel,
      notificationModel,
      prefs,
      settings,
      { chatFor } as unknown as PersonalChats,
      { sendMessage, botUsername: () => botUsername } as unknown as TelegramBotService,
      { sendToUser } as unknown as PushSenderService,
    );
    return { service, sendMessage, sendToUser, chatFor, prefs };
  }

  async function createStudent(name = 'Ваня') {
    return userModel.create({ name, roles: [], status: 'active' });
  }

  async function withChat(name = 'Ваня') {
    const student = await createStudent(name);
    const id = student._id.toString();
    return { id, chats: new Map([[id, `chat-${id}`]]) };
  }

  it('два тика в ту же минуту — одно сообщение, reminderSentAt проставлен', async () => {
    const { id, chats } = await withChat();
    const { service, sendMessage } = build({ chats });

    expect(await service.remind(NOW)).toEqual({ reminded: 1 });
    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0] as [string, string];
    expect(chatId).toBe(`chat-${id}`);
    expect(text).toContain('Ваня, напоминаем об оплате за сентябрь 2026');
    // Дефолт ведёт к бухгалтеру напрямую, не к боту (ADR-0159).
    expect(text).toContain(`пришлите ${PAYMENT_CONTACT} в Telegram.`);
    expect(text).not.toContain('t.me');
    const doc = await paymentModel.findOne({ userId: id, month: '2026-09' }).lean();
    expect(doc?.status).toBe('unpaid');
    expect(doc?.reminderSentAt).toBeInstanceOf(Date);
    expect(await notificationModel.countDocuments({})).toBe(0);
  });

  it('гонка: два тика одновременно (два инстанса при деплое) — одно сообщение', async () => {
    const { chats } = await withChat();
    const { service, sendMessage } = build({ chats });

    const results = await Promise.all([service.remind(NOW), service.remind(NOW)]);

    expect(results.reduce((sum, r) => sum + r.reminded, 0)).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('оплативший (paid) не получает, документ не трогается', async () => {
    const { id, chats } = await withChat();
    await paymentModel.create({
      userId: id,
      month: '2026-09',
      status: 'paid',
      confirmedAt: NOW.toJSDate(),
    });
    const { service, sendMessage } = build({ chats });

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).not.toHaveBeenCalled();
    const doc = await paymentModel.findOne({ userId: id, month: '2026-09' }).lean();
    expect(doc?.reminderSentAt).toBeUndefined();
  });

  it('месяц оплачен у одного, у другого нет — напоминание только второму', async () => {
    const paid = await withChat('Оплатил');
    const owing = await withChat('Должен');
    await paymentModel.create({ userId: paid.id, month: '2026-09', status: 'paid' });
    const chats = new Map([...paid.chats, ...owing.chats]);
    const { service, sendMessage } = build({ chats });

    expect(await service.remind(NOW)).toEqual({ reminded: 1 });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(`chat-${owing.id}`, expect.any(String));
  });

  it('выключенный вид payment_due (override) не получает и документа не заводит', async () => {
    const { id, chats } = await withChat();
    const { service, sendMessage, prefs } = build({ chats });
    await prefs.set(id, 'payment_due', false);

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(await paymentModel.countDocuments({})).toBe(0);
    expect(await notificationModel.countDocuments({})).toBe(0);
  });

  it('штат и заблокированный не получают', async () => {
    const teacher = await userModel.create({
      name: 'Учитель',
      roles: ['teacher'],
      status: 'active',
    });
    const blocked = await userModel.create({
      name: 'Заблокирован',
      roles: [],
      status: 'blocked',
    });
    const chats = new Map([
      [teacher._id.toString(), 'chat-t'],
      [blocked._id.toString(), 'chat-b'],
    ]);
    const { service, sendMessage } = build({ chats });

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(await paymentModel.countDocuments({})).toBe(0);
  });

  it('31-е в феврале срабатывает 28-го, а 27-го — нет (2026 не високосный)', async () => {
    const { chats } = await withChat();
    const { service, sendMessage } = build({ chats, reminder: { dayOfMonth: 31 } });

    // 10:00 по Израилю зимой (UTC+2) = 08:00Z.
    expect(await service.remind(utc('2026-02-27T08:00:00Z'))).toEqual({ reminded: 0 });
    expect(sendMessage).not.toHaveBeenCalled();

    expect(await service.remind(utc('2026-02-28T08:00:00Z'))).toEqual({ reminded: 1 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(await paymentModel.countDocuments({ month: '2026-02' })).toBe(1);
  });

  it('переход на летнее время не сдвигает минуту: 27 марта в 06:59Z не шлёт, в 07:00Z шлёт', async () => {
    const { chats } = await withChat();
    const { service, sendMessage } = build({ chats, reminder: { dayOfMonth: 27 } });

    expect(await service.remind(utc('2026-03-27T06:59:00Z'))).toEqual({ reminded: 0 });
    expect(sendMessage).not.toHaveBeenCalled();

    expect(await service.remind(utc('2026-03-27T07:00:00Z'))).toEqual({ reminded: 1 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('окно суток догоняет пропущенный тик, а через 24 часа закрыто', async () => {
    const { chats } = await withChat();
    const { service, sendMessage } = build({ chats });

    expect(await service.remind(NOW.plus({ hours: 24 }))).toEqual({ reminded: 0 });
    expect(sendMessage).not.toHaveBeenCalled();

    expect(await service.remind(NOW.plus({ hours: 23, minutes: 59 }))).toEqual({
      reminded: 1,
    });
  });

  it('без личного чата — строка в ленте и push; повторный тик второй строки не заводит', async () => {
    const student = await createStudent();
    const id = student._id.toString();
    const { service, sendMessage, sendToUser } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: 1 });
    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendToUser).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith(id, NOW);
    const rows = await notificationModel.find({ userId: id, kind: 'payment_due' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.paymentMonth).toBe('2026-09');
    expect(rows[0]?.readAt).toBeNull();
    const doc = await paymentModel.findOne({ userId: id, month: '2026-09' }).lean();
    expect(doc?.reminderSentAt).toBeInstanceOf(Date);
  });

  it('Telegram не доставил (sendMessage вернул false) — строка в ленте и push, повтора нет', async () => {
    const { id, chats } = await withChat();
    const { service, sendMessage, sendToUser } = build({ chats, sendResult: false });

    expect(await service.remind(NOW)).toEqual({ reminded: 1 });
    expect(await service.remind(NOW.plus({ minutes: 1 }))).toEqual({ reminded: 0 });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendToUser).toHaveBeenCalledWith(id, NOW);
    expect(await notificationModel.countDocuments({ userId: id })).toBe(1);
  });

  it('свой шаблон со {ссылка} — deep link на бота, контакт тоже подставлен', async () => {
    const { chats } = await withChat();
    const { service, sendMessage } = build({
      chats,
      reminder: { template: 'Присылайте {контакт} или сюда:[ {ссылка}]' },
    });

    await service.remind(NOW);

    const text = (sendMessage.mock.calls[0] as [string, string])[1];
    expect(text).toBe(
      `Присылайте ${PAYMENT_CONTACT} или сюда: https://t.me/${BOT_NAME}?start=pay_2026-09`,
    );
  });

  it('нет имени бота — ссылка исчезает вместе с пробелом, конец текста без хвоста', async () => {
    const { chats } = await withChat();
    const { service, sendMessage } = build({
      chats,
      botUsername: undefined,
      reminder: { template: 'Присылайте {контакт}.[ {ссылка}]' },
    });

    await service.remind(NOW);

    const text = (sendMessage.mock.calls[0] as [string, string])[1];
    expect(text).not.toContain('t.me');
    expect(text.endsWith(`Присылайте ${PAYMENT_CONTACT}.`)).toBe(true);
  });

  it('{сумма} подставляется из amountMinor документа оплаты', async () => {
    const { id, chats } = await withChat();
    await paymentModel.create({
      userId: id,
      month: '2026-09',
      status: 'unpaid',
      amountMinor: 25050,
    });
    const { service, sendMessage } = build({
      chats,
      reminder: { template: '{имя}, к оплате[ {сумма}] за {месяц}.' },
    });

    await service.remind(NOW);

    expect(sendMessage).toHaveBeenCalledWith(
      `chat-${id}`,
      'Ваня, к оплате 250,50 ₪ за сентябрь 2026.',
    );
  });

  it('enabled: false — ни отправки, ни запроса за учениками', async () => {
    const { chats } = await withChat();
    const findUsers = jest.spyOn(userModel, 'find');
    const { service, sendMessage } = build({ chats, reminder: { enabled: false } });

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(findUsers).not.toHaveBeenCalled();
    expect(await paymentModel.countDocuments({})).toBe(0);
  });

  it('за тик не больше PAYMENT_REMINDER_BATCH_LIMIT человек, остаток добирает следующий', async () => {
    const total = PAYMENT_REMINDER_BATCH_LIMIT + 1;
    await userModel.insertMany(
      Array.from({ length: total }, (_, i) => ({
        name: `Ученик ${i}`,
        roles: [],
        status: 'active',
      })),
    );
    const { service, sendToUser } = build();

    expect(await service.remind(NOW)).toEqual({ reminded: PAYMENT_REMINDER_BATCH_LIMIT });
    expect(await service.remind(NOW.plus({ minutes: 1 }))).toEqual({ reminded: 1 });
    expect(await service.remind(NOW.plus({ minutes: 2 }))).toEqual({ reminded: 0 });

    expect(sendToUser).toHaveBeenCalledTimes(total);
    expect(await paymentModel.countDocuments({ reminderSentAt: { $exists: true } })).toBe(
      total,
    );
  });

  it('сбой на одном ученике: claim снимается, остальные получают, следующий тик повторит', async () => {
    const broken = await withChat('Сбой');
    const fine = await withChat('Целый');
    const chats = new Map([...broken.chats, ...fine.chats]);
    const { service, sendMessage, chatFor } = build({ chats });
    chatFor.mockImplementation((userId: string) =>
      userId === broken.id
        ? Promise.reject(new Error('mongo моргнул'))
        : Promise.resolve({ chatId: `chat-${userId}`, userId, name: 'Имя' }),
    );

    expect(await service.remind(NOW)).toEqual({ reminded: 1 });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const brokenDoc = await paymentModel
      .findOne({ userId: broken.id, month: '2026-09' })
      .lean();
    expect(brokenDoc?.reminderSentAt).toBeUndefined();

    chatFor.mockImplementation((userId: string) =>
      Promise.resolve({ chatId: `chat-${userId}`, userId, name: 'Имя' }),
    );
    expect(await service.remind(NOW.plus({ minutes: 1 }))).toEqual({ reminded: 1 });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
