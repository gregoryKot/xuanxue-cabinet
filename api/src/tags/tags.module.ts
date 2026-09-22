// Модуль сводки тегов (GET /api/tags, ADR-0075, ADR-0078, ADR-0116) — только
// модели пяти чужих доменов, свою схему не заводит (ничего не
// денормализуется).
import { Module } from '@nestjs/common';
import { ChannelModelModule } from '../channels/channel-model.module';
import { ClassesModule } from '../classes/classes.module';
import { ExamItemModelModule } from '../exams/exam-item-model.module';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { MaterialModelModule } from '../materials/material-model.module';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  // LessonModelModule — только LessonRecord, тот же приём, что у
  // ClassesModule/MaterialsModule (ADR-0013): TagsService не создаёт и не
  // меняет занятия, полный LessonsModule избыточен и рискует циклом через
  // его собственный импорт ClassesModule/MaterialsModule. ClassesModule —
  // ради ClassRecord, она же экспортирует `MongooseModule` целиком
  // (classes.module.ts: `exports: [MongooseModule, ClassesService]`), тот
  // же приём, что уже использует MaterialsService. MaterialModelModule —
  // только MaterialRecord, тем же приёмом. ChannelModelModule/
  // ExamItemModelModule — та же схема ради ChannelRecord/ExamItemRecord:
  // полные ChannelsModule/ExamsModule тянут за собой лишнее (адаптеры
  // каналов, TelegramModule) и рискуют циклом, который эти model-модули уже
  // разрывают для других доменов (см. комментарии в самих файлах).
  imports: [
    LessonModelModule,
    ClassesModule,
    MaterialModelModule,
    ChannelModelModule,
    ExamItemModelModule,
  ],
  controllers: [TagsController],
  providers: [TagsService],
})
export class TagsModule {}
