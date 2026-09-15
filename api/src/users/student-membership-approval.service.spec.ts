// Подтверждение по участию в группе — уже при повторном входе, не только
// при первом (ADR-0026, CLAUDE.md «Ноль нагрузки на ученика»). Против
// настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»: запись читаем
// обратно, а гонку двух входов ловим на реальных параллельных записях, не
// на симуляции — та уже есть в user-roles.approve.spec.ts). GroupMembershipService
// фейковый: сеть в этом файле не нужна, её уже проверяет
// group-membership.service.spec.ts (в т.ч. сбой Bot API).
import type { Model } from 'mongoose';
import type { UserStatus } from '@xuanxue/shared';
import type { GroupMembershipService } from '../channels/group-membership.service';
import { StudentMembershipApprovalService } from './student-membership-approval.service';
import { UserRecord, UserSchema } from './user.schema';
import { UserRolesService } from './user-roles.service';
import { UsersService, type UserLean } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const TELEGRAM_ID = 5001;

function fakeGroupMembership(isMember: boolean): {
  service: GroupMembershipService;
  calls: number[];
} {
  const calls: number[] = [];
  const service = {
    isMemberOfSchoolGroup: (telegramId: number) => {
      calls.push(telegramId);
      return Promise.resolve(isMember);
    },
  } as unknown as GroupMembershipService;
  return { service, calls };
}

describe('StudentMembershipApprovalService.confirmIfMember', () => {
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

  function createPerson(status: UserStatus): Promise<UserLean> {
    return users.createFromTelegram({
      telegramId: TELEGRAM_ID,
      name: 'Ждущая',
      roles: [],
      status,
    });
  }

  it('invited и состоит в группе — становится active, видно при повторном чтении', async () => {
    const person = await createPerson('invited');
    const { service: groupMembership } = fakeGroupMembership(true);
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    const confirmed = await approval.confirmIfMember(person);

    expect(confirmed.status).toBe('active');
    // Read-after-write (CLAUDE.md «Тесты»): пишем в confirmIfMember, читаем
    // отдельным запросом, как это сделает следующий GET /auth/me.
    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('invited и НЕ состоит в группе — остаётся invited, approve не вызывается', async () => {
    const person = await createPerson('invited');
    const { service: groupMembership } = fakeGroupMembership(false);
    const approveSpy = jest.spyOn(roles, 'approve');
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    const result = await approval.confirmIfMember(person);

    expect(result.status).toBe('invited');
    expect(approveSpy).not.toHaveBeenCalled();
    approveSpy.mockRestore();
  });

  // Важный тест: участие в группе НЕ снимает блокировку — это осознанное
  // решение админа (SECURITY §9), не симметричный побочный эффект.
  // groupMembership не опрашивается вовсе: confirmIfMember выходит по
  // статусу раньше, чем полез бы в Bot API.
  it('blocked и состоит в группе — остаётся blocked, группа даже не проверяется', async () => {
    const person = await createPerson('blocked');
    const { service: groupMembership, calls } = fakeGroupMembership(true);
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    const result = await approval.confirmIfMember(person);

    expect(result.status).toBe('blocked');
    expect(calls).toHaveLength(0);
    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'blocked',
    });
  });

  it('уже active — повторный вход ничего не ломает, группа не проверяется', async () => {
    const person = await createPerson('active');
    const { service: groupMembership, calls } = fakeGroupMembership(true);
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    const result = await approval.confirmIfMember(person);

    expect(result).toEqual(person);
    expect(calls).toHaveLength(0);
  });

  // Сбой Bot API при проверке членства не роняет вход и не подтверждает
  // никого: GroupMembershipService сам ловит ошибку сети и отдаёт `false`
  // (group-membership.service.spec.ts) — тот же результат, что и «не состоит
  // в группе», здесь фиксируем именно эту семантику для перепроверки при
  // входе.
  it('Bot API недоступен (isMemberOfSchoolGroup отдаёт false) — не падает, не подтверждает', async () => {
    const person = await createPerson('invited');
    const { service: groupMembership } = fakeGroupMembership(false);
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    await expect(approval.confirmIfMember(person)).resolves.toMatchObject({
      status: 'invited',
    });
  });

  // Гонка двух одновременных входов одного и того же человека (два вкладки,
  // два устройства) — настоящая параллельная запись в Mongo, не симуляция:
  // условный `findOneAndUpdate` внутри approve() не даёт второй попытке
  // затереть результат первой или упасть.
  it('гонка двух одновременных входов — оба резолвятся, итог один раз active', async () => {
    const person = await createPerson('invited');
    const { service: groupMembership } = fakeGroupMembership(true);
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    const [first, second] = await Promise.all([
      approval.confirmIfMember(person),
      approval.confirmIfMember(person),
    ]);

    expect(first.status).toBe('active');
    expect(second.status).toBe('active');
    await expect(users.findById(person.id)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('без telegramId (вошёл только по email/Google) — не падает, группу не проверяет', async () => {
    const person = await createPerson('invited');
    const withoutTelegramId: UserLean = { ...person, telegramId: undefined };
    const { service: groupMembership, calls } = fakeGroupMembership(true);
    const approval = new StudentMembershipApprovalService(groupMembership, roles);

    const result = await approval.confirmIfMember(withoutTelegramId);

    expect(result.status).toBe('invited');
    expect(calls).toHaveLength(0);
  });
});
