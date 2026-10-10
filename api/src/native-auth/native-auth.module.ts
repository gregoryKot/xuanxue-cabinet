// Нативный вход Daychi (ADR-0181). UsersModule даёт UsersService (проверка
// человека при каждом запросе), TelegramModule — PersonalChats для `botChatActive`
// в профиле: тот же путь, что у AuthModule. AuthModule — ради AuthService:
// браузерная часть входа читает сессию кабинета тем же findSessionUser, что
// вход через Google, а секрет сессии отдаёт только AuthService. AuthModule
// нативный модуль не импортирует — цикла нет.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { NativeAccountController } from './native-account.controller';
import {
  NativeAuthorizationRecord,
  NativeAuthorizationSchema,
} from './native-authorization.schema';
import { NativeAuthorizationController } from './native-authorization.controller';
import { NativeAuthorizationsService } from './native-authorizations.service';
import { NativeAuthorizeController } from './native-authorize.controller';
import { NativeBrowserFlowService } from './native-browser-flow.service';
import {
  NativeCredentialRecord,
  NativeCredentialSchema,
} from './native-credential.schema';
import { NativeGrantRecord, NativeGrantSchema } from './native-grant.schema';
import { NativeGrantsService } from './native-grants.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TelegramModule,
    MongooseModule.forFeature([
      { name: NativeGrantRecord.name, schema: NativeGrantSchema },
      { name: NativeCredentialRecord.name, schema: NativeCredentialSchema },
      { name: NativeAuthorizationRecord.name, schema: NativeAuthorizationSchema },
    ]),
  ],
  controllers: [
    NativeAccountController,
    NativeAuthorizeController,
    NativeAuthorizationController,
  ],
  providers: [NativeGrantsService, NativeAuthorizationsService, NativeBrowserFlowService],
})
export class NativeAuthModule {}
