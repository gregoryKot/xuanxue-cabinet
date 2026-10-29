// «Перегнать видео» (ADR-0189): три маршрута только для штата. Отдельный контроллер на
// том же префиксе, что ExamVideosController, — тот держит видео-ссылки и байты и уже у
// предела размера файла. Контроллер стоит в модуле РАНЬШЕ ExamVideosController: у того
// унаследован `GET :id`, и `GET codec-pending` обязан зарегистрироваться до него, иначе
// Nest отдаст литеральный путь хендлеру `get` с `id='codec-pending'` (тот же приём, что
// `stats-summary`; держит api/test/exam-videos-transcode.e2e-spec.ts).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ExamVideoDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { SetVideoCodecDto } from '../video-uploads/set-video-codec.dto';
import { ReplaceExamVideoDto } from './dto/replace-exam-video.dto';
import { ExamVideoTranscodeService } from './exam-video-transcode.service';

@Controller('exam-videos')
export class ExamVideoTranscodeController {
  constructor(private readonly service: ExamVideoTranscodeService) {}

  @Get('codec-pending')
  @ApiRoute('GET /exam-videos/codec-pending')
  @Roles('teacher', 'assistant', 'admin')
  listPending(): Promise<ExamVideoDto[]> {
    return this.service.listPending();
  }

  @Put(':id/codec')
  @ApiRoute('PUT /exam-videos/:id/codec')
  @Roles('teacher', 'assistant', 'admin')
  setCodec(
    @Param('id') id: string,
    @Body() body: SetVideoCodecDto,
  ): Promise<ExamVideoDto> {
    return this.service.setCodec(id, body.codec);
  }

  // 200, а не 201: ничего нового не создаётся, отвечаем тем же видео с новым файлом.
  @Post(':id/replace')
  @ApiRoute('POST /exam-videos/:id/replace')
  @HttpCode(HttpStatus.OK)
  @Roles('teacher', 'assistant', 'admin')
  replace(
    @Param('id') id: string,
    @Body() body: ReplaceExamVideoDto,
  ): Promise<ExamVideoDto> {
    return this.service.replace(id, body.replacementId, DateTime.utc());
  }
}
