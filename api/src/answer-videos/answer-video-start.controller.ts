// POST /attempts/:id/answer-video (ADR-0137) — начать/продолжить загрузку
// видео-ответа. Отдельный контроллер от AnswerVideosController: путь висит
// на `/attempts`, не на `/answer-videos` (тот же приём, что
// ExamMediaController рядом с ExamVideosController).
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { AnswerVideoUploadDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { AnswerVideoStartService } from './answer-video-start';
import { StartAnswerVideoDto } from './dto/start-answer-video.dto';

@Controller('attempts')
export class AnswerVideoStartController {
  constructor(private readonly service: AnswerVideoStartService) {}

  @Post(':id/answer-video')
  @ApiRoute('POST /attempts/:id/answer-video')
  @HttpCode(HttpStatus.CREATED)
  start(
    @Param('id') id: string,
    @Body() body: StartAnswerVideoDto,
    @CurrentUser() user: UserLean,
  ): Promise<AnswerVideoUploadDto> {
    return this.service.start(id, user.id, body, DateTime.utc());
  }
}
