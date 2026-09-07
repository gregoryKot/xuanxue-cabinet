// Учитель/админ, за которого TeacherChats отдаёт этот чат — роль и активный
// личный канал (ADR-0015: нажал /start). Общий для test-support
// callback-query.handler.*.spec.ts и message.handler.*.spec.ts (CLAUDE.md
// «Одна механика — один компонент», jscpd — раньше две копии).
import type { Model } from 'mongoose';
import type { ChannelRecord } from '../../channels/channel.schema';
import type { UserRecord } from '../../users/user.schema';

export async function seedTeacher(
  userModel: Model<UserRecord>,
  channelModel: Model<ChannelRecord>,
  chatId: number,
): Promise<void> {
  await userModel.create({ name: 'Мария', telegramId: chatId, roles: ['teacher'] });
  await channelModel.create({
    type: 'telegram',
    title: 'x',
    config: '{}',
    target: String(chatId),
    active: true,
  });
}
