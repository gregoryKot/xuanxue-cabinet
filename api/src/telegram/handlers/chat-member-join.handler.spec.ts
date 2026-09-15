// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): люди
// и подтверждение — через реальные UsersService/UserRolesService, ровно та
// же склейка, что в telegram-auth.service.ts (StudentMembershipApprovalService).
// GroupMembershipService — фейковый, сеть здесь не нужна (её отдельно
// проверяет group-membership.service.spec.ts). `ctx.chatMember` — минимальный
// набор полей, которые реально читает хендлер (приём — chat-member.handler.spec.ts).
import type { Model } from 'mongoose';
import type { Context } from 'telegraf';
import type { ChatMemberUpdated } from 'telegraf/types';
import type { GroupMembershipService } from '../../channels/group-membership.service';
import { StudentMembershipApprovalService } from '../../users/student-membership-approval.service';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UserRolesService } from '../../users/user-roles.service';
import { UsersService } from '../../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { ChatMemberJoinHandler } from './chat-member-join.handler';

const TELEGRAM_ID = 6001;

function fakeCtx(chatMember: Partial<ChatMemberUpdated> | undefined): Context {
  return { chatMember } as unknown as Context;
}

function joinUpdate(status: string): Partial<ChatMemberUpdated> {
  return {
    chat: { id: -100777, type: 'group', title: 'Ученики' } as never,
    old_chat_member: { status: 'left' } as never,
    new_chat_member: { status, user: { id: TELEGRAM_ID } } as never,
  };
}

function fakeGroupMembership(isMember: boolean): GroupMembershipService {
  return {
    isMemberOfSchoolGroup: () => Promise.resolve(isMember),
  } as unknown as GroupMembershipService;
}

describe('ChatMemberJoinHandler', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;
  let users: UsersService;
  let roles: UserRolesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    users = new UsersService(model);
    roles = new UserRolesService(model, users);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  function buildHandler(isMember: boolean): ChatMemberJoinHandler {
    const approval = new StudentMembershipApprovalService(
      fakeGroupMembership(isMember),
      roles,
    );
    return new ChatMemberJoinHandler(users, approval);
  }

  it('вступление в группу подтверждает ждущего человека (invited → active)', async () => {
    const person = await users.createFromTelegram({
      telegramId: TELEGRAM_ID,
      name: 'Ждущий',
      roles: [],
      status: 'invited',
    });
    const handler = buildHandler(true);

    await handler.handle(fakeCtx(joinUpdate('member')));

    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'active',
    });
  });

  // Важный тест: выход из группы ничего не меняет — блокировка и подтверждение
  // не завязаны на членство симметрично (SECURITY §9, CLAUDE.md «не делай
  // симметрию ради красоты»). Живой человек мог выйти сам или его удалили —
  // это не решение школы о доступе.
  it('выход из группы — ничего не меняет (active остаётся active)', async () => {
    const person = await users.createFromTelegram({
      telegramId: TELEGRAM_ID,
      name: 'Уже активная',
      roles: [],
      status: 'active',
    });
    const handler = buildHandler(false);

    await handler.handle(fakeCtx(joinUpdate('left')));

    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('выход из группы — invited не подтверждается заодно', async () => {
    const person = await users.createFromTelegram({
      telegramId: TELEGRAM_ID,
      name: 'Всё ещё ждёт',
      roles: [],
      status: 'invited',
    });
    const handler = buildHandler(false);

    await handler.handle(fakeCtx(joinUpdate('left')));

    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'invited',
    });
  });

  it('человек с этим telegramId ещё не входил в кабинет — апдейт молча игнорируется', async () => {
    const handler = buildHandler(true);

    await expect(handler.handle(fakeCtx(joinUpdate('member')))).resolves.toBeUndefined();
    expect(await model.countDocuments({})).toBe(0);
  });

  it('апдейт без chatMember — ничего не делает, не падает', async () => {
    const handler = buildHandler(true);

    await expect(handler.handle(fakeCtx(undefined))).resolves.toBeUndefined();
  });

  // Сбой Bot API при перепроверке членства не должен ронять обработку
  // апдейта и не должен подтверждать человека по ошибке — GroupMembershipService
  // сам ловит сбой и отдаёт false (group-membership.service.spec.ts), здесь
  // фиксируем, что хендлер (через confirmIfMember) честно это принимает.
  it('сбой проверки членства — не падает, не подтверждает', async () => {
    const person = await users.createFromTelegram({
      telegramId: TELEGRAM_ID,
      name: 'Ждущий',
      roles: [],
      status: 'invited',
    });
    const handler = buildHandler(false); // так и отвечает isMemberOfSchoolGroup при сбое сети

    await expect(handler.handle(fakeCtx(joinUpdate('member')))).resolves.toBeUndefined();
    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'invited',
    });
  });
});
