// Только регистрация модели GroupRecord — тот же приём, что у
// ChannelModelModule (ADR-0013): занятия проверяют и подписывают группы, а
// сервису групп нужен ClassesModule ради модели занятий — полный импорт
// GroupsModule в ClassesModule замкнул бы цикл. Модель регистрируется один
// раз здесь.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GroupRecord, GroupSchema } from './group.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: GroupRecord.name, schema: GroupSchema }])],
  exports: [MongooseModule],
})
export class GroupModelModule {}
