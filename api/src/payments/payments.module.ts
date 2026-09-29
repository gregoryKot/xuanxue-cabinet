// PaymentsController (/payments, бухгалтер и админ) и MyPaymentsController
// (/me/payments + приём снимка перевода, любая роль) — docs/PLAN.md §15,
// ADR-0049 и ADR-0050. UserModelModule —
// проверка владельца (assertActiveStudent, payments.queries.ts) без всего
// UsersModule (тот же приём, что у ClassesModule/LessonsModule, ADR-0013).
// SettingsModule — пояс школы для месяца по умолчанию (SettingsService.get().tz).
// `payment_screenshots` (байты снимка, ADR-0050) живёт здесь же, а не своим
// модулем: другой домен к ней не ходит, а уборщику (SchedulerModule) хватает
// экспорта MongooseModule. PaymentScreenshotDeliveryRegistry — наружу:
// TelegramModule кладёт в него доставку снимка бухгалтеру (ADR-0156),
// импортировать telegram/ отсюда нельзя (цикл, комментарий в
// payment-screenshot-delivery.port.ts).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsModule } from '../settings/settings.module';
import { UserModelModule } from '../users/user-model.module';
import { MyPaymentsController } from './my-payments.controller';
import {
  PaymentScreenshotRecord,
  PaymentScreenshotSchema,
} from './payment-screenshot.schema';
import { PaymentScreenshotDeliveryRegistry } from './payment-screenshot-delivery.registry';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentRecord, PaymentSchema } from './payment.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentRecord.name, schema: PaymentSchema },
      { name: PaymentScreenshotRecord.name, schema: PaymentScreenshotSchema },
    ]),
    UserModelModule,
    SettingsModule,
  ],
  controllers: [PaymentsController, MyPaymentsController],
  providers: [
    PaymentsService,
    PaymentScreenshotsService,
    PaymentScreenshotDeliveryRegistry,
  ],
  exports: [MongooseModule, PaymentsService, PaymentScreenshotDeliveryRegistry],
})
export class PaymentsModule {}
