// GET /users, PATCH /users/:id, DELETE /users/:id — экран «Ученики»
// (docs/PLAN.md §6, блокер аудита Б3): список вошедших, назначение ролей и
// удаление всех данных (аудит В11). Только admin — назначение ролей и
// удаление не отдаются учителю (SECURITY §3, ADR-0010). GET /users/teachers —
// исключение: список для select'а «Ведущий» (docs/PLAN.md §6 п.2, аудит В4)
// виден и teacher, и admin, поэтому у маршрута свой `@Roles`, переопределяющий
// `@Roles('admin')` класса (Reflector.getAllAndOverride — метод приоритетнее
// класса, auth.guard.ts). Маршрут объявлен раньше `:id` —
// `check-route-collisions.mjs`, Nest matches по порядку регистрации.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { InviteLinkDto, TeacherOptionDto, UserDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from './users.service';
import { InviteLinkService } from './invite-link.service';
import { TeachersService } from './teachers.service';
import { UserDeletionService } from './user-deletion.service';
import { UserRolesService } from './user-roles.service';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { toUserDto } from './user.mapper';

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(
    private readonly userRolesService: UserRolesService,
    private readonly teachersService: TeachersService,
    private readonly userDeletionService: UserDeletionService,
    private readonly inviteLinkService: InviteLinkService,
  ) {}

  @Get('teachers')
  @Roles('teacher', 'admin')
  async listTeachers(): Promise<TeacherOptionDto[]> {
    return this.teachersService.listTeachers();
  }

  // Ссылка-приглашение школы (ADR-0030) — литеральный сегмент, не `:id`,
  // коллизии с маршрутами ниже нет (check-route-collisions.mjs). Доступна
  // admin и teacher (уточнение владельца 2026-09-15: ссылку раздаёт и
  // учитель) — тот же приём переопределения `@Roles('admin')` класса, что у
  // `listTeachers()` выше; помощник учителя и бухгалтер сюда не входят —
  // список ролей называет владелец явно, не общее «учитель = помощник».
  @Get('invite-link')
  @Roles('teacher', 'admin')
  async getInviteLink(): Promise<InviteLinkDto> {
    return this.inviteLinkService.getCurrent();
  }

  @Post('invite-link')
  @Roles('teacher', 'admin')
  @HttpCode(200)
  async rotateInviteLink(@CurrentUser() currentUser: UserLean): Promise<InviteLinkDto> {
    return this.inviteLinkService.rotate(currentUser.id);
  }

  @Get()
  async list(@Query() query: ListUsersDto): Promise<UserDto[]> {
    const users = await this.userRolesService.list(query);
    return users.map(toUserDto);
  }

  @Patch(':id')
  async updateRoles(
    @Param('id') id: string,
    @Body() body: UpdateUserRolesDto,
    @CurrentUser() currentUser: UserLean,
  ): Promise<UserDto> {
    const user = await this.userRolesService.updateRoles(id, body.roles, currentUser.id);
    return toUserDto(user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserLean,
  ): Promise<void> {
    await this.userDeletionService.deleteAllUserData(id, currentUser.id);
  }
}
