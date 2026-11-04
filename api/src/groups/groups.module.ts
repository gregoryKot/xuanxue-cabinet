import { Module } from '@nestjs/common';
import { ChannelModelModule } from '../channels/channel-model.module';
import { ClassesModule } from '../classes/classes.module';
import { GroupModelModule } from './group-model.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  // ClassesModule отдаёт модель занятий, ChannelModelModule — каналов: группа
  // считает их и переписывает подписи занятий (ADR-0195).
  imports: [GroupModelModule, ClassesModule, ChannelModelModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  // Сид занятий находит или заводит группу по названию из файла (SeedService).
  exports: [GroupsService],
})
export class GroupsModule {}
