// MeDto.botChatActive для PATCH /me/profile и PUT /me/no-telegram (ADR-0087):
// оба маршрута кладут ответ прямо на экран (auth/AuthProvider.tsx, applyMe),
// а MeDto без этого поля не собрать. UsersModule не может взять его из
// PersonalChats.hasActiveChatFor (api/src/telegram/) — TelegramModule сам
// импортирует UsersModule, обратный импорт закольцевал бы граф (ADR-0013,
// forwardRef в проекте не используется). Модель ChannelRecord приходит через
// ChannelModelModule (channels/channel-model.module.ts) — тот же приём, что у
// UserModelModule/LessonModelModule/ExamAttemptModelModule; сама проверка —
// в channels/has-active-telegram-chat.ts, чтобы не заводить вторую реализацию
// рядом с PersonalChats.hasActiveChatFor (CLAUDE.md «Одна механика»).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ChannelRecord } from '../channels/channel.schema';
import { hasActiveTelegramChat } from '../channels/has-active-telegram-chat';
import type { UserLean } from './users.service';

@Injectable()
export class UserBotChatStatusService {
  constructor(
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
  ) {}

  hasActiveChatFor(user: UserLean | null): Promise<boolean> {
    return hasActiveTelegramChat(this.channelModel, user);
  }
}
