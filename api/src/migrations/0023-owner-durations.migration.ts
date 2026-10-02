// Длительности, которые владелец уточнил 2026-10-02 после сверки полного
// расписания: веер во вторник 18:30–19:30 и «Основы Дхармы» 12:00–13:30.
// 0019 взяла их из списка сайта (90 и 60 минут), а 0022 не трогает
// длительность существующих правил, поэтому здесь она ставится явно — по
// моменту занятия, у любого слота с этим правилом: это слово владельца о
// собственном расписании, а не догадка по таблице (ADR-0166, дополнение).
// Субботняя медитация 18:00–19:30 подтверждена как есть.
import type { mongo } from 'mongoose';
import { WEEKDAY_LABELS_RU } from '@xuanxue/shared';
import type { SeedRule } from './school-schedule-docs';

type Db = mongo.Db;

const DURATIONS: readonly SeedRule[] = [
  { weekday: 2, time: '18:30', durationMin: 60 },
  { weekday: 5, time: '12:00', durationMin: 90 },
];

export const ownerDurations = {
  id: '0023-owner-durations',
  async up(db: Db): Promise<string[]> {
    const report: string[] = [];
    for (const { weekday, time, durationMin } of DURATIONS) {
      const { modifiedCount } = await db
        .collection('classes')
        .updateMany(
          { rules: { $elemMatch: { weekday, time, durationMin: { $ne: durationMin } } } },
          { $set: { 'rules.$[rule].durationMin': durationMin, updatedAt: new Date() } },
          { arrayFilters: [{ 'rule.weekday': weekday, 'rule.time': time }] },
        );
      if (modifiedCount > 0) {
        report.push(
          `${WEEKDAY_LABELS_RU[weekday]} ${time}: ${durationMin} минут (${modifiedCount})`,
        );
      }
    }
    return report;
  },
};
