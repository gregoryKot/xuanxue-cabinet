// Кому пишет бот (ADR-0015, docs/PLAN.md §6): учителя/помощники учителя/
// админы с telegramId, у кого есть активный личный канал (channels type
// telegram, target = String(telegramId)) — то есть кто нажал /start. Один
// источник для всех проактивных отправителей (предпросмотр, «Запись?»,
// ручные каналы, уведомления об ошибках) — CLAUDE.md «Одна механика — один
// компонент».
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ChannelRecord } from '../channels/channel.schema';
import { UsersService } from '../users/users.service';

export interface TeacherChat {
  chatId: string;
  userId: string;
  name: string;
}

// Ни одного чата — не ошибка (школа ещё не подключила бота), но и не должно
// тонуть в логе на каждом тике: warn раз в час, не раз в минуту.
const EMPTY_WARN_INTERVAL_MIN = 60;

@Injectable()
export class TeacherChats {
  private readonly logger = new Logger(TeacherChats.name);
  private lastEmptyWarnAt: DateTime | null = null;

  constructor(
    private readonly usersService: UsersService,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
  ) {}

  async list(now: DateTime): Promise<TeacherChat[]> {
    const contacts = await this.usersService.listTeacherContacts();
    if (contacts.length === 0) return this.warnIfEmpty([], now);

    const targets = contacts.map((c) => String(c.telegramId));
    const channels = await this.channelModel
      .find({ type: 'telegram', target: { $in: targets }, active: true }, { target: 1 })
      .lean<{ target: string }[]>();
    const activeTargets = new Set(channels.map((c) => c.target));

    const chats = contacts
      .filter((c) => activeTargets.has(String(c.telegramId)))
      .map((c) => ({ chatId: String(c.telegramId), userId: c.id, name: c.name }));
    return this.warnIfEmpty(chats, now);
  }

  private warnIfEmpty(chats: TeacherChat[], now: DateTime): TeacherChat[] {
    if (chats.length > 0) return chats;
    const dueForWarn =
      !this.lastEmptyWarnAt ||
      now.diff(this.lastEmptyWarnAt, 'minutes').minutes >= EMPTY_WARN_INTERVAL_MIN;
    if (dueForWarn) {
      this.lastEmptyWarnAt = now;
      this.logger.warn(
        'ни один учитель/админ не подключил бота (нет активного личного канала ' +
          'после /start) — уведомления и предпросмотр отправить некому.',
      );
    }
    return chats;
  }
}
