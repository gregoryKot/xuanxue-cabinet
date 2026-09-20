// GET /tags — сводка тегов школы (ADR-0059, ADR-0074), доступ штату школы,
// как у остальных списков школы (MaterialsController). Контроллер только
// валидирует query и зовёт сервис.
import { Controller, Get, Query } from '@nestjs/common';
import type { TagSummaryDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ListTagsDto } from './dto/list-tags.dto';
import { TagsService } from './tags.service';

@Controller('tags')
@Roles('teacher', 'assistant', 'admin')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(@Query() query: ListTagsDto): Promise<TagSummaryDto[]> {
    return this.tagsService.list(query);
  }
}
