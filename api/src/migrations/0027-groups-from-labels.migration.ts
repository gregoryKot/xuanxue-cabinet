// Группы школы из подписей занятий (ADR-0193). До этого `classes.groupLabel` —
// свободный текст на каждом занятии, и одна группа жила под семью написаниями
// («новички», «начинающие», «младшая группа», «средняя группа», «старшая
// группа», «продвинутые», «все группы»): ничто не показывало, что это одна и
// та же группа. Миграция заводит три группы школы и переводит подписи в
// `groupIds`; сама `groupLabel` остаётся и становится производной (названия
// групп через запятую), поэтому всё, что её читает, не меняется.
//
// Совместима со старым кодом на время выката (expand → deploy → contract):
// старый код читает только `groupLabel`, и она остаётся читаемой. Занятия,
// у которых `groupIds` уже есть, пропускаются — повторный запуск ничего не
// делает. Подпись, которой нет в таблице, не теряется: под неё заводится
// группа с тем же названием, и миграция называет её в отчёте — владелец решит,
// оставить её или слить с одной из трёх.
import { Types, type mongo } from 'mongoose';
import { DEFAULT_GROUP_NAMES, groupNameKey } from '@xuanxue/shared';

type Db = mongo.Db;

const GROUPS = 'groups';
const CLASSES = 'classes';

interface GroupDoc {
  _id: Types.ObjectId;
  name: string;
  nameKey: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyClassDoc {
  _id: Types.ObjectId;
  groupLabel?: string;
}

const [BEGINNERS, INTERMEDIATE, ADVANCED] = DEFAULT_GROUP_NAMES;

/** Старое написание (по `groupNameKey`) → группы школы. */
const LEGACY_LABELS: Record<string, readonly string[]> = {
  новички: [BEGINNERS],
  начинающие: [BEGINNERS],
  'младшая группа': [BEGINNERS],
  'средняя группа': [INTERMEDIATE],
  'старшая группа': [ADVANCED],
  продвинутые: [ADVANCED],
  'все группы': DEFAULT_GROUP_NAMES,
};

export const groupsFromLabels = {
  id: '0027-groups-from-labels',
  async up(db: Db): Promise<string[]> {
    const groups = db.collection<GroupDoc>(GROUPS);
    const classes = db.collection<LegacyClassDoc>(CLASSES);
    const byId = new Map<string, string>();
    const idByKey = new Map<string, Types.ObjectId>();

    // Группа по названию: есть — она, нет — заводится. `_id` задаём здесь, не
    // на сервере: идентификаторы одного процесса растут, и порядок создания
    // (по нему идёт порядок групп) совпадает с порядком вызовов.
    async function ensureGroup(name: string): Promise<Types.ObjectId> {
      const nameKey = groupNameKey(name);
      const cached = idByKey.get(nameKey);
      if (cached) return cached;
      const now = new Date();
      const doc = await groups.findOneAndUpdate(
        { nameKey },
        {
          $setOnInsert: {
            _id: new Types.ObjectId(),
            name,
            nameKey,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!doc) throw new Error(`группа «${name}» не заведена`);
      idByKey.set(nameKey, doc._id);
      byId.set(doc._id.toString(), doc.name);
      return doc._id;
    }

    // Три группы школы заводятся всегда и по порядку, даже если ни одно занятие
    // их не носит: учитель увидит их в списке сразу.
    for (const name of DEFAULT_GROUP_NAMES) await ensureGroup(name);

    const ownGroups = new Map<string, number>();
    let migrated = 0;
    const pending = classes.find({ groupIds: { $exists: false } });
    for await (const cls of pending) {
      const label = (cls.groupLabel ?? '').trim();
      const names = label === '' ? [] : (LEGACY_LABELS[groupNameKey(label)] ?? [label]);
      if (label !== '' && !(groupNameKey(label) in LEGACY_LABELS)) {
        ownGroups.set(label, (ownGroups.get(label) ?? 0) + 1);
      }
      const ids = await Promise.all(names.map(ensureGroup));
      // По порядку создания групп — тот же, в каком подпись собирает сервер.
      const sorted = [...new Set(ids.map(String))].sort();
      await classes.updateOne(
        { _id: cls._id, groupIds: { $exists: false } },
        {
          $set: {
            groupIds: sorted.map((id) => new Types.ObjectId(id)),
            groupLabel: sorted.map((id) => byId.get(id) ?? '').join(', '),
          },
        },
      );
      migrated += 1;
    }

    const report = [`занятий переведено на группы: ${migrated}`];
    for (const [label, count] of ownGroups) {
      report.push(
        `подпись «${label}» не из списка — заведена своя группа (занятий: ${count})`,
      );
    }
    return report;
  },
};
