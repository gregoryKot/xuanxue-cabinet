import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonRecord, LessonSchema } from './lesson.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LessonRecord.name, schema: LessonSchema }]),
  ],
  exports: [MongooseModule],
})
export class LessonsModule {}
