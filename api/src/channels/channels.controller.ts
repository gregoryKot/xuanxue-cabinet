// CRUD каналов — доступ учителю, помощнику учителя и админу (данные школы, ADR-0010).
// Контроллер только валидирует тело/query и зовёт сервис: проверка config по
// типу, шифрование, поиск адаптера — в ChannelsService.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ChannelDto, ChannelTestResult } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ListChannelsDto } from './dto/list-channels.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Controller('channels')
@Roles('teacher', 'assistant', 'admin')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  list(@Query() query: ListChannelsDto): Promise<ChannelDto[]> {
    return this.channelsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ChannelDto> {
    return this.channelsService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateChannelDto): Promise<ChannelDto> {
    return this.channelsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateChannelDto): Promise<ChannelDto> {
    return this.channelsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.channelsService.remove(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  test(@Param('id') id: string): Promise<ChannelTestResult> {
    return this.channelsService.test(id);
  }
}
