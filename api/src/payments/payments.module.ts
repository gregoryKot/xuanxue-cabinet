// PaymentsController (/payments, бухгалтер и админ) и MyPaymentsController
// (/me/payments, любая роль) — docs/PLAN.md §15, ADR-0049. UserModelModule —
// проверка владельца (assertActiveStudent, payments.queries.ts) без всего
// UsersModule (тот же приём, что у ClassesModule/LessonsModule, ADR-0013).
// SettingsModule — пояс школы для месяца по умолчанию (SettingsService.get().tz).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsModule } from '../settings/settings.module';
import { UserModelModule } from '../users/user-model.module';
import { MyPaymentsController } from './my-payments.controller';
import { PaymentRecord, PaymentSchema } from './payment.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PaymentRecord.name, schema: PaymentSchema }]),
    UserModelModule,
    SettingsModule,
  ],
  controllers: [PaymentsController, MyPaymentsController],
  providers: [PaymentsService],
  exports: [MongooseModule, PaymentsService],
})
export class PaymentsModule {}
