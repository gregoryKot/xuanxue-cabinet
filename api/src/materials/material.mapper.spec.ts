// Юнит-тест toMaterialDto/toMyMaterialDto — без Mongo и DI (CLAUDE.md
// «Тесты», уровень «чистая логика»). Ключевая проверка — что библиотека
// ученика (toMyMaterialDto) не отдаёт ни createdBy, ни access, ни служебных
// дат (shared/src/materials.ts). Вызывающая сторона уже отсеяла материалы,
// скрытые от ученика (ADR-0058) — маппер сам решения о видимости не
// принимает, ученику всегда едут `url` и файл, если он загружен (ADR-0096).
import { Types } from 'mongoose';
import { toMaterialDto, toMyMaterialDto, type RawLeanMaterial } from './material.mapper';

function material(overrides: Partial<RawLeanMaterial> = {}): RawLeanMaterial {
  return {
    _id: new Types.ObjectId(),
    title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: ['старшая'],
    createdBy: new Types.ObjectId(),
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-12T09:30:00.000Z'),
    ...overrides,
  };
}

describe('toMaterialDto', () => {
  it('переносит все поля, даты — ISO UTC с Z', () => {
    const classId = new Types.ObjectId();
    const lessonId = new Types.ObjectId();
    const doc = material({ classIds: [classId], lessonIds: [lessonId] });

    const dto = toMaterialDto(doc);

    expect(dto).toEqual({
      id: doc._id.toString(),
      title: doc.title,
      url: doc.url,
      kind: doc.kind,
      classIds: [classId.toString()],
      lessonIds: [lessonId.toString()],
      access: doc.access,
      tags: doc.tags,
      createdBy: doc.createdBy.toString(),
      createdAt: '2026-09-10T08:00:00.000Z',
      updatedAt: '2026-09-12T09:30:00.000Z',
    });
  });

  // Материалы, созданные до ADR-0058, не имеют поля в документе — `.lean()`
  // не подставляет default схемы при чтении, маппер сам отдаёт `[]`.
  it('документа без поля tags (материал до этого PR) — tags: []', () => {
    const { tags: _tags, ...doc } = material();

    const dto = toMaterialDto(doc);

    expect(dto.tags).toEqual([]);
  });

  // ADR-0057: файл едет пятью полями верхнего уровня в документе — наружу
  // должно уйти только описание, а не ключ объекта в R2.
  it('материал с файлом — file с name/contentType/sizeBytes/uploadedAt (ISO Z)', () => {
    const doc = material({
      fileKey: 'materials/abc/9f1e-uuid',
      fileName: 'Методичка.pdf',
      fileContentType: 'application/pdf',
      fileSizeBytes: 12345,
      fileUploadedAt: new Date('2026-09-15T07:00:00.000Z'),
    });

    const dto = toMaterialDto(doc);

    expect(dto.file).toEqual({
      name: 'Методичка.pdf',
      contentType: 'application/pdf',
      sizeBytes: 12345,
      uploadedAt: '2026-09-15T07:00:00.000Z',
    });
  });

  // SECURITY §3, ADR-0057: ключ объекта в R2 — служебный адрес для скачивания,
  // право на которое проверяем мы; в ответе API его не должно быть ни под
  // каким именем.
  it('материал с файлом — fileKey не попадает в ответ ни под каким именем', () => {
    const doc = material({
      fileKey: 'materials/abc/9f1e-uuid-secret',
      fileName: 'Методичка.pdf',
      fileContentType: 'application/pdf',
      fileSizeBytes: 12345,
      fileUploadedAt: new Date('2026-09-15T07:00:00.000Z'),
    });

    const dto = toMaterialDto(doc);

    expect(dto).not.toHaveProperty('fileKey');
    expect(JSON.stringify(dto)).not.toContain(doc.fileKey);
  });

  it('материал без файла — ключа file в объекте нет вовсе', () => {
    const doc = material();

    const dto = toMaterialDto(doc);

    expect(dto).not.toHaveProperty('file');
  });
});

describe('toMyMaterialDto', () => {
  it('нет createdBy, access и служебных дат; url едет всегда', () => {
    const doc = material();

    const dto = toMyMaterialDto(doc, new Map());

    expect(dto).toEqual({
      id: doc._id.toString(),
      title: doc.title,
      kind: doc.kind,
      classTitles: [],
      tags: doc.tags,
      url: doc.url,
    });
    expect(dto).not.toHaveProperty('createdBy');
    expect(dto).not.toHaveProperty('access');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
    expect(dto).not.toHaveProperty('locked');
  });

  // Теги видит и ученик (ADR-0058) — рубрикация нужна прежде всего тому, кто
  // ищет своё.
  it('теги едут ученику как есть', () => {
    const dto = toMyMaterialDto(material({ tags: ['разминка', '24 формы'] }), new Map());

    expect(dto.tags).toEqual(['разминка', '24 формы']);
  });

  it('документ без поля tags — [] и в библиотеке ученика', () => {
    const { tags: _tags, ...doc } = material();

    const dto = toMyMaterialDto(doc, new Map());

    expect(dto.tags).toEqual([]);
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

  it('материал с файлом — file приходит ученику как обычно', () => {
    const doc = material({
      fileKey: 'materials/abc/9f1e-uuid',
      fileName: 'Методичка.pdf',
      fileContentType: 'application/pdf',
      fileSizeBytes: 12345,
      fileUploadedAt: new Date('2026-09-15T07:00:00.000Z'),
    });

    const dto = toMyMaterialDto(doc, new Map());

    expect(dto.url).toBe(doc.url);
    expect(dto.file).toEqual({
      name: 'Методичка.pdf',
      contentType: 'application/pdf',
      sizeBytes: 12345,
      uploadedAt: '2026-09-15T07:00:00.000Z',
    });
  });

  it('материал без файла — ключа file в ответе ученику нет', () => {
    const dto = toMyMaterialDto(material(), new Map());

    expect(dto).not.toHaveProperty('file');
  });
});

// Поле появилось вместе с файлом (ADR-0057); у документа, записанного до
// него, `.lean()` default схемы не подставляет — маппер отдаёт честный 0, а
// не undefined в JSON.
describe('toMaterialDto: файл без размера', () => {
  it('sizeBytes отсутствует в документе — в DTO приезжает 0', () => {
    const doc = material({
      fileKey: 'materials/m1/3f1a',
      fileName: 'Методичка.pdf',
      fileContentType: 'application/pdf',
      fileUploadedAt: new Date('2026-09-20T10:00:00.000Z'),
    });
    expect(toMaterialDto(doc).file?.sizeBytes).toBe(0);
  });
});
