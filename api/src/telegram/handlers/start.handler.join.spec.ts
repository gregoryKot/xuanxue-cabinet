// Ссылка-приглашение школы через бота (ADR-0030 «Бот», ADR-0034) — тот же
// код, что и на сайте (/join/<code>), тот же LoginIdentityService, что и у
// email/Telegram-входа сайта. Вынесено из start.handler.spec.ts (файловый
// храповик, CLAUDE.md «Храповики») — общий харнесс в
// start.handler.test-support.ts, чтобы сборка Mongo/StartHandler не
// дублировалась между файлами.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
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
  let handler: StartHandler;

  beforeAll(async () => {
    harness = await openStartHandlerHarness();
    ({ userModel, handler } = harness);
  }, 60_000);

  afterAll(async () => {
    await harness.memory.stop();
  });

  afterEach(async () => {
    await clearStartHandlerHarness(harness);
  });

  it('незнакомец + верный код — создаётся active из Telegram-идентичности', async () => {
    const { ctx, replies } = fakeCtx(
      604,
      'private',
      false,
      `join_${VALID_INVITE_CODE}`,
      'Аня',
    );

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([JOIN_SUCCESS]);
    const created = await userModel.findOne({ telegramId: 604 }).lean();
    expect(created?.status).toBe('active');
    expect(created?.name).toBe('Аня');
    expect(created?.roles).toEqual([]);
    expect(created?.joinedViaInviteAt).toBeInstanceOf(Date);
  });

  it('заблокированный — ACCESS_MESSAGE даже с верным кодом, статус не меняется', async () => {
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
  });

  it('незнакомец + неверный код — INVITE_LINK_INVALID_MESSAGE, аккаунт не создаётся', async () => {
    const { ctx, replies } = fakeCtx(606, 'private', false, 'join_' + '0'.repeat(32));

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
    expect(await userModel.countDocuments({ telegramId: 606 })).toBe(0);
  });

  it('active повторно — 200-эквивалент без ошибки, статус не меняется', async () => {
    await userModel.create({
      name: 'Уже в кабинете',
      telegramId: 605,
      roles: [],
      status: 'active',
    });
    const { ctx, replies } = fakeCtx(605, 'private', false, `join_${VALID_INVITE_CODE}`);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([JOIN_SUCCESS]);
  });

  // Регрессия аудита 2026-09-16: до перехода хендлера на LoginIdentityService
  // бот заводил бутстрап-админа обычным учеником без ролей вместо
  // admin+teacher, как на сайте — единый сервис проверяет
  // BOOTSTRAP_ADMIN_TELEGRAM_ID раньше кода ссылки, код ссылки игнорируется
  // (сервис заводит бутстрап-админа без него).
  it('бутстрап-админ, незнакомый базе, открыл join_<НЕВЕРНЫЙ код> — active с ролями admin и teacher', async () => {
    const { ctx, replies } = fakeCtx(
      TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
      'private',
      false,
      `join_${'0'.repeat(32)}`,
      'Дима',
    );

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([JOIN_SUCCESS]);
    const created = await userModel
      .findOne({ telegramId: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID })
      .lean();
    expect(created?.status).toBe('active');
    expect(created?.roles).toEqual(['admin', 'teacher']);
  });
});
