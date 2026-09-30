// GET /users, PATCH /users/:id, PATCH /users/:id/status, DELETE /users/:id,
// GET /users/:id/export — экран «Ученики» (docs/PLAN.md §6, блокер аудита Б3):
// список вошедших, назначение ролей, блокировка/открытие доступа (ADR-0036,
// RUNBOOK §8.15), удаление всех данных (аудит В11) и их выгрузка по просьбе
// человека (ADR-0160, RUNBOOK §8.22). Только admin — назначение ролей,
// блокировка, удаление и выгрузка не отдаются учителю (SECURITY §3, ADR-0010). GET
// /users/teachers — исключение: список для select'а «Ведущий» (docs/PLAN.md
// §6 п.2, аудит В4) виден и teacher, и admin, поэтому у маршрута свой
// `@Roles`, переопределяющий `@Roles('admin')` класса (Reflector.getAllAndOverride —
// метод приоритетнее класса, auth.guard.ts). Литеральные сегменты
// (`teachers`, `invite-link`, `:id/status`) объявлены раньше `:id` —
// `check-route-collisions.mjs`, Nest matches по порядку регистрации, хотя
// `:id/status` и `:id` не пересекаются и без этого порядка (лишний сегмент
// после параметра).
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  InviteLinkDto,
  TeacherOptionDto,
  UserDataExportDto,
  UserDto,
} from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from './users.service';
import { InviteLinkService } from './invite-link.service';
import { TeachersService } from './teachers.service';
import { UserDeletionService } from './user-deletion.service';
import { UserExportService } from './user-export.service';
import { UserRolesService } from './user-roles.service';
import { UserStatusService } from './user-status.service';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { toUserDto } from './user.mapper';

const EXPORT_CACHE_CONTROL = 'private, no-store';

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(
    private readonly userRolesService: UserRolesService,
    private readonly teachersService: TeachersService,
    private readonly userDeletionService: UserDeletionService,
    private readonly userExportService: UserExportService,
    private readonly inviteLinkService: InviteLinkService,
    private readonly userStatusService: UserStatusService,
  ) {}

  @Get('teachers')
  @ApiRoute('GET /users/teachers')
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
  @ApiRoute('GET /users/invite-link')
  @Roles('teacher', 'admin')
  async getInviteLink(): Promise<InviteLinkDto> {
    return this.inviteLinkService.getCurrent();
  }

  @Post('invite-link')
  @ApiRoute('POST /users/invite-link')
  @Roles('teacher', 'admin')
  @HttpCode(200)
  async rotateInviteLink(@CurrentUser() currentUser: UserLean): Promise<InviteLinkDto> {
    return this.inviteLinkService.rotate(currentUser.id);
  }

  @Get()
  @ApiRoute('GET /users')
  async list(@Query() query: ListUsersDto): Promise<UserDto[]> {
    const users = await this.userRolesService.list(query);
    return users.map(toUserDto);
  }

  @Patch(':id/status')
  @ApiRoute('PATCH /users/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateUserStatusDto,
    @CurrentUser() currentUser: UserLean,
  ): Promise<UserDto> {
    const user = await this.userStatusService.updateStatus(
      id,
      body.status,
      currentUser.id,
    );
    return toUserDto(user);
  }

  @Patch(':id')
  @ApiRoute('PATCH /users/:id')
  async updateRoles(
    @Param('id') id: string,
    @Body() body: UpdateUserRolesDto,
    @CurrentUser() currentUser: UserLean,
  ): Promise<UserDto> {
    const user = await this.userRolesService.updateRoles(id, body.roles, currentUser.id);
    return toUserDto(user);
  }

  @Delete(':id')
  @ApiRoute('DELETE /users/:id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserLean,
  ): Promise<void> {
    await this.userDeletionService.deleteAllUserData(id, currentUser.id);
  }

  // Выгрузка — контакты и ответы одного человека целиком: ни браузер, ни
  // промежуточный кэш её не хранят (`private, no-store`, как скриншот оплаты).
  // `:id/export` не пересекается с литеральными `teachers`/`invite-link`:
  // лишний сегмент после параметра (check-route-collisions.mjs).
  @Get(':id/export')
  @ApiRoute('GET /users/:id/export')
  @Header('Cache-Control', EXPORT_CACHE_CONTROL)
  async exportData(
    @Param('id') id: string,
    @CurrentUser() currentUser: UserLean,
  ): Promise<UserDataExportDto> {
    return this.userExportService.exportUserData(id, currentUser.id);
  }
}
