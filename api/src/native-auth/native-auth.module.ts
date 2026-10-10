// Нативный вход Daychi (ADR-0181). UsersModule даёт UsersService (проверка
// человека при каждом запросе), TelegramModule — PersonalChats для `botChatActive`
// в профиле: тот же путь, что у AuthModule. Модуль не импортирует AuthModule:
// AuthGuard глобальный, а нативные маршруты ему не принадлежат (@Public()).
// NativeGrantsService экспортируется — код обмена (следующий PR) выпускает через него.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { NativeAccountController } from './native-account.controller';
import {
  NativeCredentialRecord,
  NativeCredentialSchema,
} from './native-credential.schema';
import { NativeGrantRecord, NativeGrantSchema } from './native-grant.schema';
import { NativeGrantsService } from './native-grants.service';

@Module({
  imports: [
    UsersModule,
    TelegramModule,
    MongooseModule.forFeature([
      { name: NativeGrantRecord.name, schema: NativeGrantSchema },
      { name: NativeCredentialRecord.name, schema: NativeCredentialSchema },
    ]),
  ],
  controllers: [NativeAccountController],
  providers: [NativeGrantsService],
  exports: [NativeGrantsService],
})
export class NativeAuthModule {}
