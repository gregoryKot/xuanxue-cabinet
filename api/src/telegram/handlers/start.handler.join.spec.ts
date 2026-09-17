// Ссылка-приглашение школы через бота (ADR-0030 «Бот», ADR-0036) — тот же
// код, что и на сайте (/join/<code>), тот же LoginIdentityService, что и у
// email/Telegram-входа сайта. Вынесено из start.handler.spec.ts (файловый
// храповик, CLAUDE.md «Храповики») — общий харнесс в
// start.handler.test-support.ts, чтобы сборка Mongo/StartHandler не
// дублировалась между файлами.
//
// Баг с #131 (найден 2026-09-16, #163): вход по ссылке заводил active, но
// личный чат не регистрировался в channels — read-after-write ниже
// проверяет и channelModel, не только userModel.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import type { ChannelRecord } from '../../channels/channel.schema';
import type { ClassRecord } from '../../classes/class.schema';
import type { UserRecord } from '../../users/user.schema';
import type { StartHandler } from './start.handler';
import {
  clearStartHandlerHarness,
  fakeCtx,
  openStartHandlerHarness,
  TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
  VALID_INVITE_CODE,
  type StartHandlerHarness,
} from './start.handler.test-support';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const JOIN_SUCCESS =
  'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su';

describe('StartHandler — deep link «Ссылка-приглашение» (join_<code>, ADR-0030)', () => {
  let harness: StartHandlerHarness;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let handler: StartHandler;

  beforeAll(async () => {
    harness = await openStartHandlerHarness();
    ({ userModel, channelModel, classModel, handler } = harness);
  }, 60_000);

  afterAll(async () => {
    await harness.memory.stop();
  });

  afterEach(async () => {
    await clearStartHandlerHarness(harness);
  });

  it('незнакомец + верный код — создаётся active из Telegram-идентичности, личный канал и меню (регрессия 2026-09-16)', async () => {
    const { ctx, replies } = fakeCtx(
      604,
      'private',
      false,
      `join_${VALID_INVITE_CODE}`,
      'Аня',
    );

    await handler.handle(ctx, NOW);

    expect(replies[0]).toBe(JOIN_SUCCESS);
    expect(replies.at(-1)).toEqual(expect.stringContaining('Экзамены можно сдать'));
    const created = await userModel.findOne({ telegramId: 604 }).lean();
    expect(created?.status).toBe('active');
    expect(created?.name).toBe('Аня');
    expect(created?.roles).toEqual([]);
    expect(created?.joinedViaInviteAt).toBeInstanceOf(Date);
    const channel = await channelModel
      .findOne({ type: 'telegram', target: '604' })
      .lean();
    expect(channel?.active).toBe(true);
    expect(channel?.broadcastEligible).toBe(false);
    expect(channel?.title).toBe('Личные сообщения: Аня');
  });

  it('заблокированный — ACCESS_MESSAGE даже с верным кодом, статус не меняется, канал не создан', async () => {
    await userModel.create({
      name: 'Заблокирован',
      telegramId: 603,
      roles: [],
      status: 'blocked',
    });
    const { ctx, replies } = fakeCtx(603, 'private', false, `join_${VALID_INVITE_CODE}`);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect((await userModel.findOne({ telegramId: 603 }).lean())?.status).toBe('blocked');
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('незнакомец + неверный код — INVITE_LINK_INVALID_MESSAGE, аккаунт и канал не создаются', async () => {
    const { ctx, replies } = fakeCtx(606, 'private', false, 'join_' + '0'.repeat(32));

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
    expect(await userModel.countDocuments({ telegramId: 606 })).toBe(0);
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('active повторно — тот же успех, статус не меняется, канал зарегистрирован идемпотентно', async () => {
    await userModel.create({
      name: 'Уже в кабинете',
      telegramId: 605,
      roles: [],
      status: 'active',
    });
    const { ctx, replies } = fakeCtx(605, 'private', false, `join_${VALID_INVITE_CODE}`);

    await handler.handle(ctx, NOW);

    // Повторный /start того же человека тоже даёт успех + меню — идемпотентно,
    // тот же приём, что и обычный /start.
    expect(replies[0]).toBe(JOIN_SUCCESS);
    expect(replies.at(-1)).toEqual(expect.stringContaining('Экзамены можно сдать'));
    const channel = await channelModel
      .findOne({ type: 'telegram', target: '605' })
      .lean();
    expect(channel?.active).toBe(true);
  });

  // Баг с #131 (#163): наивный фикс мог бы звать upsertTelegramChat вместо
  // upsertPersonalTelegramChat и подключить личный чат ученика ко всем
  // активным классам (ADR-0027) — этого не происходит, тот же образец, что у
  // обычного /start.
  it('ученик по ссылке НЕ подключается к активным классам (ADR-0027)', async () => {
    const active = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });

    const { ctx } = fakeCtx(607, 'private', false, `join_${VALID_INVITE_CODE}`, 'Аня');
    await handler.handle(ctx, NOW);

    const classAfter = await classModel.findById(active._id).lean();
    expect(classAfter?.channelIds).toHaveLength(0);
  });

  // Регрессия аудита 2026-09-16: до перехода хендлера на LoginIdentityService
  // бот заводил бутстрап-админа обычным учеником без ролей вместо
  // admin+teacher, как на сайте — единый сервис проверяет
  // BOOTSTRAP_ADMIN_TELEGRAM_ID раньше кода ссылки, код ссылки игнорируется
  // (сервис заводит бутстрап-админа без него). Штат подключается как штат —
  // канал школы, не личный канал ученика.
  it('бутстрап-админ, незнакомый базе, открыл join_<НЕВЕРНЫЙ код> — active с ролями admin и teacher, канал школы', async () => {
    const { ctx, replies } = fakeCtx(
      TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
      'private',
      false,
      `join_${'0'.repeat(32)}`,
      'Дима',
    );

    await handler.handle(ctx, NOW);

    expect(replies[0]).toBe(JOIN_SUCCESS);
    expect(replies[1]).toContain('Вы подключены');
    const created = await userModel
      .findOne({ telegramId: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID })
      .lean();
    expect(created?.status).toBe('active');
    expect(created?.roles).toEqual(['admin', 'teacher']);
    const channel = await channelModel
      .findOne({ type: 'telegram', target: String(TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID) })
      .lean();
    expect(channel?.active).toBe(true);
    expect(channel?.broadcastEligible).not.toBe(false);
  });
});
