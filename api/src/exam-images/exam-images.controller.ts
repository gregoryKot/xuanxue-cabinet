// Загрузка и раздача картинок вариантов ответа (ADR-0035, PLAN §11 слой
// 4.2). POST принимает сырое тело (exam-image-body.ts/app.setup.ts), только
// штат школы; GET — без @Roles: ученику картинка нужна на экране сдачи,
// доступ решает сервис по снимку его попытки (ExamImagesService.load,
// SECURITY §3).
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { ExamImageDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { ResponseLike } from '../common/http-headers';
import type { UserLean } from '../users/users.service';
import { ExamImagesService } from './exam-images.service';

// Год в секундах — тот же смысл, что у ONE_YEAR_SECONDS в
// static/static-cache-control.ts (не экспортирован оттуда — своя константа).
const ONE_YEAR_SECONDS = 31_536_000;
// Содержимое по адресу не меняется никогда: картинка не редактируется,
// только заменяется новой (ADR-0035) — браузер может не переспрашивать.
// `private`, не `public` (в отличие от IMMUTABLE_CACHE_CONTROL у web/dist):
// ответ зависит от сессии (штат видит любую, ученик — только свою,
// SECURITY §3), общим/прокси-кешам тут не место.
//
// Ставится в теле хендлера ПОСЛЕ удачного чтения, не декоратором @Header:
// Nest выставляет заголовки декоратора до вызова хендлера, и отказ 404
// (ученик открыл адрес раньше, чем стартовал попытку) уезжал бы в кеш
// браузера на год вместе с этим заголовком — картинка не открылась бы и
// после старта (поймано e2e при ревью PR).
const EXAM_IMAGE_CACHE_CONTROL = `private, max-age=${ONE_YEAR_SECONDS}, immutable`;
const CACHE_CONTROL_HEADER = 'Cache-Control';

/** Минимальный интерфейс вместо @types/express (которого нет в
 * зависимостях api/) — тот же приём, что RequestLike в common/http-headers.ts.
 * `@Body()` здесь не годится: ValidationPipe (transform: true) попытался бы
 * превратить сырой Buffer в экземпляр класса DTO. */
interface RawBodyRequest {
  body?: unknown;
}

@Controller('exam-images')
export class ExamImagesController {
  constructor(private readonly service: ExamImagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  upload(
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<ExamImageDto> {
    return this.service.upload(req.body, user.id);
  }

  // `passthrough: true` — заголовок ставим сами, а тело по-прежнему отдаёт
  // Nest (StreamableFile): без passthrough ответ пришлось бы писать вручную.
  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<StreamableFile> {
    const image = await this.service.load(id, user);
    res.setHeader(CACHE_CONTROL_HEADER, EXAM_IMAGE_CACHE_CONTROL);
    return new StreamableFile(image.bytes, {
      type: image.contentType,
      length: image.bytes.length,
    });
  }
}
