import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserRecord, UserSchema } from './user.schema';
import { TeachersService } from './teachers.service';
import { UserDeletionService } from './user-deletion.service';
import { UserRolesService } from './user-roles.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserRecord.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [UsersService, UserRolesService, TeachersService, UserDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
