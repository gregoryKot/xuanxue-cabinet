// Нативные доступы Daychi как отдельный модуль (ADR-0185): NativeGrantsService
// нужен и нативным маршрутам (NativeAuthModule), и глобальному AuthGuard
// (AuthModule) — гвард принимает bearer на маршрутах с @AllowNativeBearer().
// NativeAuthModule импортирует AuthModule ради AuthService, поэтому провайдер
// в нём AuthModule увидеть не мог бы без цикла; здесь он зависит только от
// UsersModule, и оба потребителя импортируют этот модуль вниз по графу.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import {
  NativeCredentialRecord,
  NativeCredentialSchema,
} from './native-credential.schema';
import { NativeGrantRecord, NativeGrantSchema } from './native-grant.schema';
import { NativeGrantsService } from './native-grants.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: NativeGrantRecord.name, schema: NativeGrantSchema },
      { name: NativeCredentialRecord.name, schema: NativeCredentialSchema },
    ]),
  ],
  providers: [NativeGrantsService],
  exports: [NativeGrantsService],
})
export class NativeGrantsModule {}
