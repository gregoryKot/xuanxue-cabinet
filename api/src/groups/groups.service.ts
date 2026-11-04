// Список групп школы (ADR-0193, ADR-0195): создание, переименование, удаление и
// счёт занятий и каналов. Подпись `groupLabel` у занятий — названия их групп;
// переименование переписывает её у всех занятий с этой группой, чтобы посты, бот и
// экраны учеников (их десятки мест) продолжали читать одно поле.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GROUP_NOT_FOUND_MESSAGE,
  groupNameKey,
  LIST_LIMIT_MAX,
  type GroupDto,
  type GroupInput,
} from '@xuanxue/shared';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { ConflictError, NotFoundError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { assertObjectId } from '../common/object-id';
import { selectGroups, type NamedGroup } from './group-selection';
import { toGroupDto, type LeanGroup } from './group.mapper';
import { GroupRecord } from './group.schema';

/** Что держит группу: занятия и каналы называются по отдельности — учителю
 * надо знать, где искать (ADR-0195). */
function inUseMessage(classCount: number, channelCount: number): string {
  const parts: string[] = [];
  if (classCount > 0) parts.push(`занятий: ${classCount}`);
  if (channelCount > 0) parts.push(`каналов: ${channelCount}`);
  return `Группа выбрана у ${parts.join(' и ')}. Сначала выберите там другую группу или «Без группы», потом удалите.`;
}

function duplicateMessage(existingName: string): string {
  return `Группа «${existingName}» уже есть. Отметьте её в списке.`;
}

// Личные чаты учеников (ADR-0027) — не каналы школы и группы не имеют; в счёт
// каналов группы они не входят.
const SCHOOL_CHANNELS = { broadcastEligible: { $ne: false } };

@Injectable()
export class GroupsService {
  constructor(
    @InjectModel(GroupRecord.name) private readonly model: Model<GroupRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
  ) {}

  async list(): Promise<GroupDto[]> {
    const [docs, classCounts, channelCounts] = await Promise.all([
      this.model.find().sort({ _id: 1 }).limit(LIST_LIMIT_MAX).lean<LeanGroup[]>(),
      this.countByGroup(this.classModel, {}),
      this.countByGroup(this.channelModel, SCHOOL_CHANNELS),
    ]);
    return docs.map((doc) =>
      toGroupDto(
        doc,
        classCounts.get(doc._id.toString()) ?? 0,
        channelCounts.get(doc._id.toString()) ?? 0,
      ),
    );
  }

  async create(input: GroupInput): Promise<GroupDto> {
    const name = input.name.trim();
    try {
      const created = await this.model.create({ name, nameKey: groupNameKey(name) });
      const doc = await this.model.findById(created._id).lean<LeanGroup>();
      if (!doc) throw new NotFoundError(GROUP_NOT_FOUND_MESSAGE);
      return toGroupDto(doc, 0, 0);
    } catch (error) {
      throw await this.duplicateOrRethrow(error, name);
    }
  }

  /** Группа по названию: есть — она, нет — заводится. Для импорта занятий из
   * файла сида (SeedService), где группа названа текстом. */
  async ensureByName(name: string): Promise<string> {
    const trimmed = name.trim();
    const existing = await this.model
      .findOne({ nameKey: groupNameKey(trimmed) })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (existing) return existing._id.toString();
    return (await this.create({ name: trimmed })).id;
  }

  async rename(id: string, input: GroupInput): Promise<GroupDto> {
    assertObjectId(id, GROUP_NOT_FOUND_MESSAGE);
    const name = input.name.trim();
    let doc: LeanGroup | null;
    try {
      doc = await this.model
        .findOneAndUpdate(
          { _id: id },
          { $set: { name, nameKey: groupNameKey(name) } },
          { returnDocument: 'after' },
        )
        .lean<LeanGroup>();
    } catch (error) {
      throw await this.duplicateOrRethrow(error, name);
    }
    if (!doc) throw new NotFoundError(GROUP_NOT_FOUND_MESSAGE);
    await this.relabelClasses(doc._id);
    const [classCount, channelCount] = await Promise.all([
      this.classModel.countDocuments({ groupIds: doc._id }),
      this.channelModel.countDocuments({ groupIds: doc._id, ...SCHOOL_CHANNELS }),
    ]);
    return toGroupDto(doc, classCount, channelCount);
  }

  async remove(id: string): Promise<void> {
    assertObjectId(id, GROUP_NOT_FOUND_MESSAGE);
    const [classCount, channelCount] = await Promise.all([
      this.classModel.countDocuments({ groupIds: id }),
      this.channelModel.countDocuments({ groupIds: id }),
    ]);
    if (classCount + channelCount > 0)
      throw new ConflictError(inUseMessage(classCount, channelCount));
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) throw new NotFoundError(GROUP_NOT_FOUND_MESSAGE);
  }

  /** Подпись `groupLabel` каждого занятия с этой группой — заново из названий
   * всех его групп (порядок и запятые собирает один `selectGroups`). */
  private async relabelClasses(groupId: Types.ObjectId): Promise<void> {
    const classes = await this.classModel
      .find({ groupIds: groupId }, { groupIds: 1 })
      .lean<{ _id: Types.ObjectId; groupIds: Types.ObjectId[] }[]>();
    if (classes.length === 0) return;
    const all = await this.model.find().select('name').lean<NamedGroup[]>();
    await Promise.all(
      classes.map((cls) =>
        this.classModel.updateOne(
          { _id: cls._id },
          { $set: { groupLabel: selectGroups(all, cls.groupIds).groupLabel } },
        ),
      ),
    );
  }

  /** Сколько документов несёт каждая группа — одна агрегация на весь список.
   * Документ с несколькими группами считается в каждой из них. */
  private async countByGroup(
    model: Pick<Model<ClassRecord>, 'aggregate'>,
    filter: Record<string, unknown>,
  ): Promise<Map<string, number>> {
    const rows = await model.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { ...filter, groupIds: { $exists: true } } },
      { $unwind: '$groupIds' },
      { $group: { _id: '$groupIds', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }

  private async duplicateOrRethrow(error: unknown, name: string): Promise<unknown> {
    if (!isDuplicateKeyError(error)) return error;
    const existing = await this.model
      .findOne({ nameKey: groupNameKey(name) })
      .select('name')
      .lean<{ name: string }>();
    return new ConflictError(duplicateMessage(existing?.name ?? name));
  }
}
