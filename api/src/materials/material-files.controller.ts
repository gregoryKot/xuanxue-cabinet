// Файл материала (ADR-0057, слой 3.10 docs/PLAN.md §14). Отдельный
// контроллер, а не метод в MaterialsController: у того на классе стоит
// `@Roles` штата школы, а скачивание нужно и ученику — право решает сервис
// по тому же `isMaterialHiddenFromStudent`, что и список (ADR-0058).
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { isStaffRole, type MaterialDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { UploadMaterialFileDto } from './dto/upload-material-file.dto';
import { MaterialFilesService } from './material-files.service';

const STAFF_ONLY_ROLES = ['teacher', 'assistant', 'admin'] as const;

// Подписанная ссылка живёт минуты — ответ с ней не должен осесть ни в
// браузере, ни в промежуточном кеше: по протухшей ссылке хранилище ответит
// отказом, и файл «перестанет открываться» без единой ошибки у нас.
const NO_STORE = 'no-store';
const CACHE_CONTROL_HEADER = 'Cache-Control';
const LOCATION_HEADER = 'Location';

/** Минимальный интерфейс вместо @types/express (которого нет в зависимостях
 * api/) — тот же приём, что ResponseLike в common/http-headers.ts, плюс код
 * ответа: редирект ставит и заголовок, и статус. */
interface RedirectResponseLike {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
}

/** `@Body()` для сырого тела не годится: ValidationPipe (transform: true)
 * попытался бы превратить Buffer в экземпляр класса DTO (exam-images). */
interface RawBodyRequest {
  body?: unknown;
}

@Controller('materials')
export class MaterialFilesController {
  constructor(private readonly service: MaterialFilesService) {}

  @Post(':id/file')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF_ONLY_ROLES)
  upload(
    @Param('id') id: string,
    @Query() query: UploadMaterialFileDto,
    @Req() req: RawBodyRequest,
  ): Promise<MaterialDto> {
    return this.service.upload(id, req.body, query.name, DateTime.utc());
  }

  @Delete(':id/file')
  @Roles(...STAFF_ONLY_ROLES)
  detach(@Param('id') id: string): Promise<MaterialDto> {
    return this.service.detach(id, DateTime.utc());
  }

  // Без @Roles: файл открывается любой вошедшей роли, как и сам материал в
  // библиотеке (`/me/materials`). Служебный материал (`access: 'staff'`) не
  // откроется никому, кроме штата, — это решает сервис, а не декоратор.
  @Get(':id/file')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<void> {
    const url = await this.service.signedUrl(id, isStaffRole(user.roles), DateTime.utc());
    res.setHeader(CACHE_CONTROL_HEADER, NO_STORE);
    res.setHeader(LOCATION_HEADER, url);
    res.status(HttpStatus.FOUND);
  }
}
