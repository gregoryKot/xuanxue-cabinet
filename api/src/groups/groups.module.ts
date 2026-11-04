import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { GroupModelModule } from './group-model.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  // ClassesModule отдаёт модель занятий: группа считает и переписывает их подписи.
  imports: [GroupModelModule, ClassesModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  // Сид занятий находит или заводит группу по названию из файла (SeedService).
  exports: [GroupsService],
})
export class GroupsModule {}
