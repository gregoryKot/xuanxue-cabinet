// Сборка MenuCommandHandler для тестов: те же зависимости, что в модуле, но
// на моделях тестового соединения. Вынесено сюда, чтобы не повторять четыре
// строки в каждом спеке (CLAUDE.md «Одна механика — один компонент»).
import type { Connection, Model } from 'mongoose';
import { ClassRecord } from '../../classes/class.schema';
import type { ChannelRecord } from '../../channels/channel.schema';
import { LessonRecord } from '../../lessons/lesson.schema';
import { MyLessonsService } from '../../lessons/my-lessons.service';
import type { UsersService } from '../../users/users.service';
import { MenuCommandHandler } from '../handlers/menu-command.handler';
import { buildPersonalChats } from './build-personal-chats';

export function buildMenuHandler(
  connection: Connection,
  usersService: UsersService,
  channelModel: Model<ChannelRecord>,
): MenuCommandHandler {
  return new MenuCommandHandler(
    buildPersonalChats(connection, usersService, channelModel),
    new MyLessonsService(
      connection.model<LessonRecord>(LessonRecord.name),
      connection.model<ClassRecord>(ClassRecord.name),
    ),
  );
}
