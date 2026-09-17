// Модуль заготовок частых комментариев при проверке (слой 4.6, PLAN §11,
// ADR-0041) — отдельный от ExamsModule: список не относится ни к форме, ни
// к попытке, только к самому полю комментария на карточке проверки, и не
// нужен ни одному сервису экзаменов (CLAUDE.md «Файлы»).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GradingCommentPresetRecord,
  GradingCommentPresetSchema,
} from './grading-comment-preset.schema';
import { GradingPresetsController } from './grading-presets.controller';
import { GradingPresetsService } from './grading-presets.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GradingCommentPresetRecord.name, schema: GradingCommentPresetSchema },
    ]),
  ],
  controllers: [GradingPresetsController],
  providers: [GradingPresetsService],
})
export class GradingPresetsModule {}
