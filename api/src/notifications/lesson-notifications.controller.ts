// GET/PUT /me/notifications/lessons — «о каких занятиях напоминать» (ADR-0162).
// Без @Roles: доступно любой роли, включая ученика и гостя без единой роли, —
// человек настраивает только свой аккаунт, userId берётся из сессии
// (@CurrentUser), не из тела или query (SECURITY §3).
import { Body, Controller, Get, Put } from '@nestjs/common';
import type { MyLessonNotificationsDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { UpdateLessonScopeDto } from './dto/update-lesson-scope.dto';
import { LessonNotificationsService } from './lesson-notifications.service';

@Controller('me/notifications/lessons')
export class LessonNotificationsController {
  constructor(private readonly lessonNotifications: LessonNotificationsService) {}

  @Get()
  @ApiRoute('GET /me/notifications/lessons')
  get(@CurrentUser() user: UserLean): Promise<MyLessonNotificationsDto> {
    return this.lessonNotifications.get(user.id);
  }

  // PUT, а не PATCH: тело — выбор целиком (режим и весь список галочек), второй
  // такой же запрос ничего не меняет.
  @Put('scope')
  @ApiRoute('PUT /me/notifications/lessons/scope')
  update(
    @Body() body: UpdateLessonScopeDto,
    @CurrentUser() user: UserLean,
  ): Promise<MyLessonNotificationsDto> {
    return this.lessonNotifications.update(user.id, body);
  }
}
