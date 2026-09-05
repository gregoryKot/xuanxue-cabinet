import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClassRecord, ClassSchema } from './class.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ClassRecord.name, schema: ClassSchema }])],
  exports: [MongooseModule],
})
export class ClassesModule {}
