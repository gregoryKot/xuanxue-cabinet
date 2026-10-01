// Юнит-тест markUserJoined (mark-user-joined.ts) — фейковый UsersService.
import { DateTime } from 'luxon';
import type { UserLean, UsersService } from './users.service';
import { markUserJoined } from './mark-user-joined';

const NOW = DateTime.fromISO('2026-09-28T10:00:00Z');
const USER: UserLean = {
  id: 'u1',
  name: 'Новый ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};

describe('markUserJoined', () => {
  it('пишет через UsersService.markJoinedViaInvite и возвращает свежий joinedViaInviteAt', async () => {
    let recorded: { id: string; now: DateTime } | undefined;
    const usersService = {
      markJoinedViaInvite: (id: string, now: DateTime) => {
        recorded = { id, now };
        return Promise.resolve();
      },
    } as unknown as UsersService;

    const result = await markUserJoined(usersService, USER, NOW);

    expect(recorded).toEqual({ id: 'u1', now: NOW });
    expect(result).toEqual({ ...USER, joinedViaInviteAt: NOW.toJSDate() });
  });
});
