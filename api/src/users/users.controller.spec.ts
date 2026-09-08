// Test.createTestingModule с фейком сервиса — образец broadcasts.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (users.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { TeacherOptionDto, UserDto } from '@xuanxue/shared';
import type { UserLean } from './users.service';
import { TeachersService } from './teachers.service';
import { UserDeletionService } from './user-deletion.service';
import { UserRolesService } from './user-roles.service';
import { UsersController } from './users.controller';

const USER_LEAN: UserLean = {
  id: 'u1',
  name: 'Гриша',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

const ADMIN: UserLean = {
  id: 'admin-1',
  name: 'Маша',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

async function buildController(
  service: Partial<UserRolesService> = {},
  teachersService: Partial<TeachersService> = {},
  deletionService: Partial<UserDeletionService> = {},
): Promise<UsersController> {
  const module = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [
      { provide: UserRolesService, useValue: service },
      { provide: TeachersService, useValue: teachersService },
      { provide: UserDeletionService, useValue: deletionService },
    ],
  }).compile();
  return module.get(UsersController);
}

describe('UsersController', () => {
  it('list() передаёт query-DTO (лимит) в сервис и маппит через toUserDto', async () => {
    const list = jest.fn().mockResolvedValue([USER_LEAN]);
    const controller = await buildController({ list });
    const query = { limit: 10 };

    const result = await controller.list(query);

    expect(list).toHaveBeenCalledWith(query);
    expect(result).toEqual<UserDto[]>([
      {
        id: 'u1',
        name: 'Гриша',
        roles: ['teacher'],
        status: 'active',
        hasTelegram: false,
        lastLoginAt: undefined,
      },
    ]);
  });

  it('updateRoles() передаёт id из пути, роли из тела и id вызывающего из сессии', async () => {
    const updateRoles = jest.fn().mockResolvedValue(USER_LEAN);
    const controller = await buildController({ updateRoles });

    const result = await controller.updateRoles('u1', { roles: ['teacher'] }, ADMIN);

    // req.user.id (сессия) уходит в сервис как currentUserId, не body — тело
    // запроса не содержит id вызывающего (SECURITY §2: снятие admin у себя).
    expect(updateRoles).toHaveBeenCalledWith('u1', ['teacher'], 'admin-1');
    expect(result.id).toBe('u1');
  });

  it('remove() передаёт id из пути и id вызывающего из сессии в deleteAllUserData', async () => {
    const deleteAllUserData = jest.fn().mockResolvedValue(undefined);
    const controller = await buildController({}, {}, { deleteAllUserData });

    await controller.remove('u1', ADMIN);

    expect(deleteAllUserData).toHaveBeenCalledWith('u1', 'admin-1');
  });

  it('listTeachers() делегирует TeachersService.listTeachers()', async () => {
    const teachers: TeacherOptionDto[] = [{ id: 't1', name: 'Дмитрий' }];
    const listTeachers = jest.fn().mockResolvedValue(teachers);
    const controller = await buildController({}, { listTeachers });

    const result = await controller.listTeachers();

    expect(listTeachers).toHaveBeenCalledWith();
    expect(result).toEqual(teachers);
  });
});
