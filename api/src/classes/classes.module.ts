import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelModelModule } from '../channels/channel-model.module';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { MaterialModelModule } from '../materials/material-model.module';
import { UserModelModule } from '../users/user-model.module';
import { ClassRecord, ClassSchema } from './class.schema';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ClassRecord.name, schema: ClassSchema }]),
    // remove() проверяет lessons.exists({ classId }) — только модель,
    // не весь LessonsModule (его контроллер/сервис здесь не нужны, а полный
    // импорт замкнул бы цикл: LessonsModule сам зависит от ClassesModule
    // ради модели ClassRecord, см. lesson-model.module.ts).
    LessonModelModule,
    // create() подставляет активные Telegram-каналы новому занятию по
    // умолчанию (fix «новое занятие без каналов») — только модель, тот же
    // приём (ADR-0013, channel-model.module.ts).
    ChannelModelModule,
    // create()/update() проверяют leaderId через assertTeacherExists (аудит
    // В4) — только модель UserRecord, тот же приём.
    UserModelModule,
    // remove() отвязывает удалённый класс от materials.classIds (ADR-0056,
    // ADR-0047 «Последствия») — только модель, тот же приём: полный импорт
    // MaterialsModule замкнул бы цикл через её собственный импорт ClassesModule.
    MaterialModelModule,
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  // ClassesService экспортирован для SeedModule (PR H): импорт занятий из
  // сида переиспользует create() — там же шифрование zoomLink/zoomPassword,
  // дублировать его в семинге нельзя (CLAUDE.md «Одна механика»).
  exports: [MongooseModule, ClassesService],
})
export class ClassesModule {}
