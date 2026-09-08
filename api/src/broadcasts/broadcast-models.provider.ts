// Пять моделей рассылки (занятие, класс, канал, рассылка, доставка) нужны в
// одном и том же порядке и той же связке SendNowService и
// RecordingBroadcastService — у обоих сервисов конструктор был идентичным
// пятикратным @InjectModel (jscpd-храповик поймал клон). Один
// @Injectable()-провайдер с публичными readonly-полями вместо пяти
// параметров конструктора — CLAUDE.md «Одна механика — один компонент».
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { BroadcastRecord } from './broadcast.schema';

@Injectable()
export class BroadcastModels {
  constructor(
    @InjectModel(LessonRecord.name) public readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) public readonly classModel: Model<ClassRecord>,
    @InjectModel(ChannelRecord.name) public readonly channelModel: Model<ChannelRecord>,
    @InjectModel(BroadcastRecord.name)
    public readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(DeliveryRecord.name)
    public readonly deliveryModel: Model<DeliveryRecord>,
  ) {}
}
