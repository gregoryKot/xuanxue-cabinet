// Юнит-тест toMaterialDto/toMyMaterialDto — без Mongo и DI (CLAUDE.md
// «Тесты», уровень «чистая логика»). Ключевая проверка — что библиотека
// ученика (toMyMaterialDto) не отдаёт ни createdBy, ни access, ни служебных
// дат (ADR-0048, shared/src/materials.ts).
import { Types } from 'mongoose';
import { toMaterialDto, toMyMaterialDto, type RawLeanMaterial } from './material.mapper';

function material(overrides: Partial<RawLeanMaterial> = {}): RawLeanMaterial {
  return {
    _id: new Types.ObjectId(),
    title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    access: 'all',
    createdBy: new Types.ObjectId(),
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-12T09:30:00.000Z'),
    ...overrides,
  };
}

describe('toMaterialDto', () => {
  it('переносит все поля, даты — ISO UTC с Z', () => {
    const classId = new Types.ObjectId();
    const doc = material({ classIds: [classId] });

    const dto = toMaterialDto(doc);

    expect(dto).toEqual({
      id: doc._id.toString(),
      title: doc.title,
      url: doc.url,
      kind: doc.kind,
      classIds: [classId.toString()],
      access: doc.access,
      createdBy: doc.createdBy.toString(),
      createdAt: '2026-09-10T08:00:00.000Z',
      updatedAt: '2026-09-12T09:30:00.000Z',
    });
  });
});

describe('toMyMaterialDto', () => {
  it('нет createdBy, access и служебных дат; url есть, locked не выставлен', () => {
    const doc = material();

    const dto = toMyMaterialDto(doc, new Map());

    expect(dto).toEqual({
      id: doc._id.toString(),
      title: doc.title,
      kind: doc.kind,
      classTitles: [],
      url: doc.url,
    });
    expect(dto).not.toHaveProperty('createdBy');
    expect(dto).not.toHaveProperty('access');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
    expect(dto).not.toHaveProperty('locked');
  });

  // Привязка к занятиям едет и ученику, но названием, а не id: `GET /classes`
  // ему закрыт ролью, подписать id было бы нечем (ADR-0047).
  it('занятия приходят названиями', () => {
    const classId = new Types.ObjectId();
    const titles = new Map([[classId.toString(), 'Тайцзицюань, средняя группа']]);

    const dto = toMyMaterialDto(material({ classIds: [classId] }), titles);

    expect(dto.classTitles).toEqual(['Тайцзицюань, средняя группа']);
  });

  // Занятие удалили, а материал остался — строка просто короче, без «—» и
  // без пустой подписи.
  it('занятие, которого уже нет, выпадает из списка названий', () => {
    const dto = toMyMaterialDto(
      material({ classIds: [new Types.ObjectId()] }),
      new Map(),
    );

    expect(dto.classTitles).toEqual([]);
  });
});
