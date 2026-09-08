// Только регистрация модели UserRecord, без контроллера/сервиса — тот же
// приём, что ChannelModelModule/LessonModelModule (ADR-0013): ClassesService
// и LessonsService проверяют leaderId (assertTeacherExists, аудит В4) и им
// нужна модель UserRecord, но не весь UsersModule (контроллер «Люди» тут не
// при чём). Модель регистрируется один раз здесь, оба домена берут её
// отсюда — второй раз она регистрируется в самом UsersModule (тот же приём,
// что ChannelRecord в ChannelsModule и ChannelModelModule, ADR-0013).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserRecord, UserSchema } from './user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserRecord.name, schema: UserSchema }])],
  exports: [MongooseModule],
})
export class UserModelModule {}
