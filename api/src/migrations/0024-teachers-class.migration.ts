// Занятие для преподавателей — пятница 20:00–21:00 раз в две недели, первое
// 2026-10-02, в комнате Zoom пятницы 18:30, ссылка уходит в общий канал школы
// (ответы владельца 2026-10-02). Правило «раз в две недели» — ADR-0168; само
// занятие заводится миграцией, как всё полное расписание (ADR-0166).
//
// Пт 20:00 уже кем-то занято — новое не заводим: учитель мог завести занятие
// сам, и дубль разослал бы вторую ссылку. Отчёт об этом — в лог.
import type { mongo } from 'mongoose';
import { EVERY_TWO_WEEKS } from '@xuanxue/shared';
import {
  newSlotDocument,
  readBroadcastChannelIds,
  readZoomOf,
  type ClassDoc,
  type SlotShape,
} from './school-schedule-docs';

type Db = mongo.Db;

const CLASSES = 'classes';

const SLOT: SlotShape = {
  title: 'Занятие для преподавателей',
  groupLabel: '',
  format: 'online',
  location: null,
};
const RULE = {
  weekday: 5,
  time: '20:00',
  durationMin: 60,
  everyWeeks: EVERY_TWO_WEEKS,
  startsOn: '2026-10-02',
} as const;
// Та же комната Zoom, что у пятничного «Тайцзицюань · все группы».
const SAME_ZOOM_AS = { weekday: 5, time: '18:30' } as const;

export const teachersClass = {
  id: '0024-teachers-class',
  async up(db: Db): Promise<string[]> {
    const classes = db.collection<ClassDoc>(CLASSES);
    const taken = await classes.findOne({
      rules: { $elemMatch: { weekday: RULE.weekday, time: RULE.time } },
    });
    if (taken?.title === SLOT.title) return [];
    if (taken) {
      return [
        `Пт 20:00 уже занято «${taken.title}» — занятие для преподавателей не заведено`,
      ];
    }

    const zoom = await readZoomOf(classes, SAME_ZOOM_AS);
    const channelIds = await readBroadcastChannelIds(db);
    await classes.insertOne(
      newSlotDocument({ slot: SLOT, rules: [RULE], channelIds, zoom, now: new Date() }),
    );
    return [
      'заведено «Занятие для преподавателей»: Пт 20:00, раз в 2 недели с 2026-10-02',
    ];
  },
};
