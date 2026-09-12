import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsController } from './exam-items.controller';
import { ExamItemsService } from './exam-items.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ExamItemRecord.name, schema: ExamItemSchema }]),
  ],
  controllers: [ExamItemsController],
  providers: [ExamItemsService],
  exports: [MongooseModule, ExamItemsService],
})
export class ExamsModule {}
