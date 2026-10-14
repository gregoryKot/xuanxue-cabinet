// Вход из wiki (ADR-0183). AuthModule — ради AuthService (чтение сессии и
// выпуск cookie профиля), UsersModule — ради UsersService (аккаунт проверяется
// при каждом входе). Ни тот ни другой этот модуль не импортируют — цикла нет.
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WikiEntryController } from './wiki-entry.controller';
import { WikiEntryService } from './wiki-entry.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [WikiEntryController],
  providers: [WikiEntryService],
})
export class WikiEntryModule {}
