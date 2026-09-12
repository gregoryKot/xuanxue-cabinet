// GET/PATCH /settings, POST /settings/preview — шаблоны школы (docs/PLAN.md
// §6 «Шаблоны»), доступ учителю, помощнику учителя и админу (данные школы, ADR-0010).
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PreviewTemplateResult, SettingsDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { PreviewSettingsDto } from './dto/preview-settings.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@Roles('teacher', 'assistant', 'admin')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(): Promise<SettingsDto> {
    return this.settingsService.get();
  }

  @Patch()
  update(@Body() body: UpdateSettingsDto): Promise<SettingsDto> {
    return this.settingsService.update(body);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: PreviewSettingsDto): Promise<PreviewTemplateResult> {
    return this.settingsService.preview(body, DateTime.utc());
  }
}
