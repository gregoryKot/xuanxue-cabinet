// События школы (ADR-0177): CRUD штата (`/events`) и список предстоящих для
// доски (`/me/events`). Свой модуль: события не нужны ни одному другому
// сервису (CLAUDE.md «Файлы»).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MySchoolEventsController } from './my-school-events.controller';
import { SchoolEventRecord, SchoolEventSchema } from './school-event.schema';
import { SchoolEventsController } from './school-events.controller';
import { SchoolEventsService } from './school-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SchoolEventRecord.name, schema: SchoolEventSchema },
    ]),
  ],
  controllers: [SchoolEventsController, MySchoolEventsController],
  providers: [SchoolEventsService],
})
export class SchoolEventsModule {}
