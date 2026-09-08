// GET /users, PATCH /users/:id, DELETE /users/:id — экран «Люди» (docs/PLAN.md
// §6, блокер аудита Б3): список вошедших через Telegram, назначение ролей и
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
  Query,
} from '@nestjs/common';
import type { TeacherOptionDto, UserDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from './users.service';
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
  ) {}

  @Get('teachers')
  @Roles('teacher', 'admin')
  async listTeachers(): Promise<TeacherOptionDto[]> {
    return this.teachersService.listTeachers();
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
