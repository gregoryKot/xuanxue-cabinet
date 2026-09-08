// GET /users, PATCH /users/:id — экран «Люди» (docs/PLAN.md §6, блокер
// аудита Б3): список вошедших через Telegram и назначение ролей. Только
// admin — назначение ролей не отдаётся учителю (SECURITY §3, ADR-0010).
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { UserDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from './users.service';
import { UserRolesService } from './user-roles.service';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { toUserDto } from './user.mapper';

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly userRolesService: UserRolesService) {}

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
}
