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

  // Общего дня у школы нет (ADR-0161): напоминание получает только тот, кто
  // выбрал свой день. По умолчанию ученик выбрал 5-е — день, на который
  // приходится NOW; `null` — ученик ничего не выбирал.
  const OWN_DAY = 5;

  async function createStudent(name = 'Ваня', day: number | null = OWN_DAY) {
    const student = await userModel.create({ name, roles: [], status: 'active' });
    if (day !== null) {
      await new NotificationPrefsService(prefsModel).setPaymentReminderDay(
        student._id.toString(),
        day,
      );
    }
    return student;
  }

  async function withChat(name = 'Ваня', day: number | null = OWN_DAY) {
    const student = await createStudent(name, day);
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

  // ADR-0163: режим ученика у штата «понарошку» — деньги в него не входят.
  // Всё остальное у учителя как у настоящего ученика (свой день, чат, вид
  // включён), чтобы отказ держал именно выборка получателей, а не случайность.
  it('штат в режиме ученика не получает: оплаты — только настоящим ученикам', async () => {
    const teacher = await userModel.create({
      name: 'Учитель',
      roles: ['teacher'],
      status: 'active',
      studentModeAt: NOW.toJSDate(),
    });
    const id = teacher._id.toString();
    await new NotificationPrefsService(prefsModel).setPaymentReminderDay(id, OWN_DAY);
    const { service, sendMessage } = build({ chats: new Map([[id, 'chat-t']]) });

    expect(await service.remind(NOW)).toEqual({ reminded: 0 });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(await paymentModel.countDocuments({})).toBe(0);
    expect(await notificationModel.countDocuments({})).toBe(0);
  });

  it('31-е в феврале срабатывает 28-го, а 27-го — нет (2026 не високосный)', async () => {
    const { chats } = await withChat('Ваня', 31);
    const { service, sendMessage } = build({ chats });

    // 10:00 по Израилю зимой (UTC+2) = 08:00Z.
    expect(await service.remind(utc('2026-02-27T08:00:00Z'))).toEqual({ reminded: 0 });
    expect(sendMessage).not.toHaveBeenCalled();

    expect(await service.remind(utc('2026-02-28T08:00:00Z'))).toEqual({ reminded: 1 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(await paymentModel.countDocuments({ month: '2026-02' })).toBe(1);
  });

  it('переход на летнее время не сдвигает минуту: 27 марта в 06:59Z не шлёт, в 07:00Z шлёт', async () => {
    const { chats } = await withChat('Ваня', 27);
    const { service, sendMessage } = build({ chats });

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

  describe('свой день ученика (ADR-0161)', () => {
    // 12 сентября 2026, 10:00 в Израиле (UTC+3).
    const OWN_DAY_NOW = utc('2026-09-12T07:00:00Z');

    it('со своим днём получает в свой день, а в другой — нет', async () => {
      const { id, chats } = await withChat('Ваня', 12);
      const { service, sendMessage } = build({ chats });

      expect(await service.remind(NOW)).toEqual({ reminded: 0 });
      expect(sendMessage).not.toHaveBeenCalled();
      expect(await paymentModel.countDocuments({})).toBe(0);

      expect(await service.remind(OWN_DAY_NOW)).toEqual({ reminded: 1 });
      expect(sendMessage).toHaveBeenCalledWith(`chat-${id}`, expect.any(String));
      const doc = await paymentModel.findOne({ userId: id, month: '2026-09' }).lean();
      expect(doc?.reminderSentAt).toBeInstanceOf(Date);
    });

    it('без своего дня не получает никогда: ни в один день месяца, документ оплаты не заводится', async () => {
      const { chats } = await withChat('Ваня', null);
      const { service, sendMessage } = build({ chats });

      for (let day = 1; day <= 30; day += 1) {
        // 10:00 по Израилю в сентябре (UTC+3) = 07:00Z.
        const tick = utc(`2026-09-${String(day).padStart(2, '0')}T07:00:00Z`);
        expect(await service.remind(tick)).toEqual({ reminded: 0 });
      }

      expect(sendMessage).not.toHaveBeenCalled();
      expect(await paymentModel.countDocuments({})).toBe(0);
    });

    it('двое в один тик: у каждого свой день — каждому в свой, а без дня — никому', async () => {
      const first = await withChat('Пятого', 5);
      const second = await withChat('Двенадцатого', 12);
      const none = await withChat('Без дня', null);
      const chats = new Map([...first.chats, ...second.chats, ...none.chats]);
      const { service, sendMessage } = build({ chats });

      expect(await service.remind(NOW)).toEqual({ reminded: 1 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        `chat-${first.id}`,
        expect.any(String),
      );

      expect(await service.remind(OWN_DAY_NOW)).toEqual({ reminded: 1 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        `chat-${second.id}`,
        expect.any(String),
      );
      expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    it('снял свой день (null) — напоминание больше не приходит', async () => {
      const { id, chats } = await withChat('Ваня', 12);
      const { service, sendMessage, prefs } = build({ chats });
      await prefs.setPaymentReminderDay(id, null);

      expect(await service.remind(OWN_DAY_NOW)).toEqual({ reminded: 0 });
      expect(await service.remind(NOW)).toEqual({ reminded: 0 });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('окно суток работает и для своего дня: день 12 догоняется до 10:00 следующего дня', async () => {
      const { chats } = await withChat('Ваня', 12);
      const { service } = build({ chats });

      expect(await service.remind(OWN_DAY_NOW.plus({ hours: 24 }))).toEqual({
        reminded: 0,
      });
      expect(await service.remind(OWN_DAY_NOW.plus({ hours: 23 }))).toEqual({
        reminded: 1,
      });
    });

    it('оплативший и уже получивший со своим днём в свой день не получают', async () => {
      const paid = await withChat('Оплатил', 12);
      const sent = await withChat('Получил', 12);
      const chats = new Map([...paid.chats, ...sent.chats]);
      const { service, sendMessage } = build({ chats });
      await paymentModel.create({ userId: paid.id, month: '2026-09', status: 'paid' });
      await paymentModel.create({
        userId: sent.id,
        month: '2026-09',
        status: 'unpaid',
        reminderSentAt: NOW.toJSDate(),
      });

      expect(await service.remind(OWN_DAY_NOW)).toEqual({ reminded: 0 });

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('свой день 31 в сентябре (30 дней) — сработает 30-го', async () => {
      const { chats } = await withChat('Ваня', 31);
      const { service, sendMessage } = build({ chats });

      expect(await service.remind(utc('2026-09-29T07:00:00Z'))).toEqual({ reminded: 0 });
      expect(await service.remind(utc('2026-09-30T07:00:00Z'))).toEqual({ reminded: 1 });
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('выключенный вид payment_due перебивает свой день', async () => {
      const { id, chats } = await withChat('Ваня', 12);
      const { service, sendMessage, prefs } = build({ chats });
      await prefs.set(id, 'payment_due', false);

      expect(await service.remind(OWN_DAY_NOW)).toEqual({ reminded: 0 });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('ни одно число не открыто (1-е до 10:00) — ни одного запроса к базе', async () => {
      await withChat();
      const findUsers = jest.spyOn(userModel, 'find');
      const findPrefs = jest.spyOn(prefsModel, 'find');
      const { service } = build();

      // 1 сентября 00:30 по Израилю = 31 августа 21:30Z.
      expect(await service.remind(utc('2026-08-31T21:30:00Z'))).toEqual({ reminded: 0 });

      expect(findUsers).not.toHaveBeenCalled();
      expect(findPrefs).not.toHaveBeenCalled();
    });
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
    const students = await userModel.insertMany(
      Array.from({ length: total }, (_, i) => ({
        name: `Ученик ${i}`,
        roles: [],
        status: 'active',
      })),
    );
    await prefsModel.insertMany(
      students.map((student) => ({
        userId: student._id.toString(),
        paymentReminderDay: OWN_DAY,
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
