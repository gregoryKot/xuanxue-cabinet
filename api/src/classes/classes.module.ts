import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonsModule } from '../lessons/lessons.module';
import { ClassRecord, ClassSchema } from './class.schema';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ClassRecord.name, schema: ClassSchema }]),
    // remove() проверяет lessons.countDocuments({ classId }) — модуль экспортирует
    // MongooseModule, свой контроллер/сервис у него не подключаем.
    LessonsModule,
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [MongooseModule],
})
export class ClassesModule {}
