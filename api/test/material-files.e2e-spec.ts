// e2e файлов материалов (ADR-0057, слой 3.10 docs/PLAN.md §14). Главный
// тест здесь — «ученик без оплаты не получает 302 на файл закрытого
// материала»: право на файл обязано совпадать с правом на ссылку
// (isMaterialLocked, ADR-0048), иначе рубильник оплаты обходится прямым
// адресом файла.
//
// Настоящий AppModule на MongoMemoryServer; в R2 не ходим — FileStoreService
// подменён на FakeFileStore (e2e-support/fake-file-store.ts).
import request from 'supertest';
import type { ApiErrorBody, MaterialDto, MyMaterialDto } from '@xuanxue/shared';
import {
  MATERIAL_FILE_DOCX_CONTENT_TYPE,
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_NOT_FOUND_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { PLAIN_ZIP_BYTES } from '../src/common/zip-fixture.test-support';
import { FileStoreService } from '../src/storage/file-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { sessionCookieFor } from './e2e-support/http';
import {
  createMaterialFileRequests,
  DOCX_BYTES,
  DOCX_FILE_NAME,
  FILE_NAME,
  OPEN_MATERIAL,
  PAID_MATERIAL,
  PDF_BYTES,
  type MaterialFileRequests,
} from './e2e-support/material-files-fixtures';

describe('Файлы материалов (e2e, ADR-0057)', () => {
  let testApp: TestApp;
  let store: FakeFileStore;
  let api: MaterialFileRequests;

  beforeAll(async () => {
    store = new FakeFileStore();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(store);
    });
    api = createMaterialFileRequests(request, server);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    store.objects.clear();
    store.enabled = true;
    store.failRemove = false;
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  describe('право на файл — то же, что на ссылку (ADR-0048)', () => {
    it('ученик без оплаты не получает 302 на файл закрытого материала', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(teacherCookie, PAID_MATERIAL);
      expect(
        await api.patchSettings(teacherCookie, { materialsPaidAccess: true }),
      ).toMatchObject({ status: 200 });
      const studentCookie = await sessionCookieFor(testApp.app, []);

      const res = await request(server())
        .get(`/api/materials/${material.id}/file`)
        .set('Cookie', studentCookie);

      expect(res.status).toBe(404);
      expect((res.body as ApiErrorBody).message).toBe(MATERIAL_FILE_NOT_FOUND_MESSAGE);
      expect(res.headers.location).toBeUndefined();
      // Ни в одном поле ответа не должно быть ни ключа объекта, ни подписи.
      expect(JSON.stringify(res.body)).not.toContain('fake-r2');
    });

    it('штат открывает тот же закрытый файл — рубильник про учеников', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(teacherCookie, PAID_MATERIAL);
      await api.patchSettings(teacherCookie, { materialsPaidAccess: true });

      const res = await request(server())
        .get(`/api/materials/${material.id}/file`)
        .set('Cookie', teacherCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('X-Amz-Signature=');
    });

    it('открытый материал ученик скачивает — 302 и no-store', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(teacherCookie, OPEN_MATERIAL);
      const studentCookie = await sessionCookieFor(testApp.app, []);

      const res = await request(server())
        .get(`/api/materials/${material.id}/file`)
        .set('Cookie', studentCookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('X-Amz-Expires=600');
      // Подписанная ссылка живёт минуты — кешировать редирект нельзя.
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('библиотека ученика: у закрытого материала нет ни url, ни file', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      await api.materialWithFile(teacherCookie, PAID_MATERIAL);
      await api.patchSettings(teacherCookie, { materialsPaidAccess: true });
      const studentCookie = await sessionCookieFor(testApp.app, []);

      const res = await request(server())
        .get('/api/me/materials')
        .set('Cookie', studentCookie);

      const material = (res.body as MyMaterialDto[]).find(
        (m) => m.title === PAID_MATERIAL.title,
      );
      expect(material).toMatchObject({ locked: true });
      expect(material).not.toHaveProperty('url');
      expect(material).not.toHaveProperty('file');
    });

    it('без сессии — 401, файл не отдаётся', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(teacherCookie, OPEN_MATERIAL);

      const res = await request(server()).get(`/api/materials/${material.id}/file`);

      expect(res.status).toBe(401);
      expect(res.headers.location).toBeUndefined();
    });
  });

  describe('загрузка — только штат школы', () => {
    it('ученик: POST и DELETE файла — 403', async () => {
      const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(teacherCookie, OPEN_MATERIAL);
      const studentCookie = await sessionCookieFor(testApp.app, []);

      expect((await api.uploadFile(studentCookie, material.id)).status).toBe(403);
      expect((await api.deleteFile(studentCookie, material.id)).status).toBe(403);
    });

    it('учитель: описание файла в ответе, ключ объекта не утекает', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(cookie, OPEN_MATERIAL);

      expect(material.file).toMatchObject({
        name: FILE_NAME,
        contentType: 'application/pdf',
        sizeBytes: PDF_BYTES.length,
      });
      expect(material.file?.uploadedAt).toMatch(/Z$/);
      const [key] = [...store.objects.keys()];
      expect(key).toMatch(new RegExp(`^materials/${material.id}/`));
      expect(JSON.stringify(material)).not.toContain(key);
    });

    it('не тот формат — 400 с советом, в хранилище ничего не легло', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const created = await api.postMaterial(cookie, OPEN_MATERIAL);
      const id = (created.body as MaterialDto).id;

      const res = await api.uploadFile(cookie, id, Buffer.from('просто текст', 'utf8'));

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toBe(MATERIAL_FILE_UNSUPPORTED_MESSAGE);
      expect(store.objects.size).toBe(0);
    });

    // `.docx` — единственный формат из MATERIAL_FILE_CONTENT_TYPES, у
    // которого сигнатуры первых байтов мало (это ZIP, как и любой OOXML):
    // проверка живёт в содержимом контейнера — центральном каталоге ZIP
    // (ADR-0080).
    it('.docx загружается — формат узнан по записям ZIP-каталога', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const created = await api.postMaterial(cookie, OPEN_MATERIAL);
      const id = (created.body as MaterialDto).id;

      const res = await api.uploadFile(
        cookie,
        id,
        DOCX_BYTES,
        MATERIAL_FILE_DOCX_CONTENT_TYPE,
        DOCX_FILE_NAME,
      );

      expect(res.status).toBe(200);
      expect((res.body as MaterialDto).file).toMatchObject({
        name: DOCX_FILE_NAME,
        contentType: MATERIAL_FILE_DOCX_CONTENT_TYPE,
        sizeBytes: DOCX_BYTES.length,
      });
      expect(store.objects.size).toBe(1);
    });

    it('ZIP под видом .docx — отказ: заголовку не верим, решает содержимое', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const created = await api.postMaterial(cookie, OPEN_MATERIAL);
      const id = (created.body as MaterialDto).id;

      const res = await api.uploadFile(
        cookie,
        id,
        PLAIN_ZIP_BYTES,
        MATERIAL_FILE_DOCX_CONTENT_TYPE,
        DOCX_FILE_NAME,
      );

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toBe(MATERIAL_FILE_UNSUPPORTED_MESSAGE);
      expect(store.objects.size).toBe(0);
    });

    it('пустое тело — 400 про пустой файл', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const created = await api.postMaterial(cookie, OPEN_MATERIAL);

      const res = await api.uploadFile(
        cookie,
        (created.body as MaterialDto).id,
        Buffer.alloc(0),
      );

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toBe(MATERIAL_FILE_EMPTY_MESSAGE);
    });

    it('хранилище не подключено — 503, материал цел', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const created = await api.postMaterial(cookie, OPEN_MATERIAL);
      const id = (created.body as MaterialDto).id;
      store.enabled = false;

      const res = await api.uploadFile(cookie, id);

      expect(res.status).toBe(503);
      expect((res.body as ApiErrorBody).code).toBe('not_available');
    });
  });

  describe('уборка (ADR-0057, ADR-0079)', () => {
    it('замена файла уносит прежний объект', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(cookie, OPEN_MATERIAL);
      const [firstKey] = [...store.objects.keys()];

      const again = await api.uploadFile(
        cookie,
        material.id,
        PDF_BYTES,
        'application/pdf',
        'Второй.pdf',
      );

      expect(again.status).toBe(200);
      expect((again.body as MaterialDto).file?.name).toBe('Второй.pdf');
      expect(store.objects.size).toBe(1);
      expect(store.objects.has(firstKey ?? '')).toBe(false);
    });

    it('удаление материала уносит и файл', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(cookie, OPEN_MATERIAL);

      const res = await api.deleteMaterial(cookie, material.id);

      expect(res.status).toBe(204);
      expect(store.objects.size).toBe(0);
    });

    it('DELETE файла оставляет материал без файла', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(cookie, OPEN_MATERIAL);

      const res = await api.deleteFile(cookie, material.id);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('file');
      expect((res.body as MaterialDto).title).toBe(OPEN_MATERIAL.title);
      expect(store.objects.size).toBe(0);
    });

    it('хранилище отказало на удалении — материал всё равно удалён, объект ждёт уборщика', async () => {
      const cookie = await sessionCookieFor(testApp.app, ['teacher']);
      const material = await api.materialWithFile(cookie, OPEN_MATERIAL);
      store.failRemove = true;

      const res = await api.deleteMaterial(cookie, material.id);

      expect(res.status).toBe(204);
      // Объект остался в хранилище — его заберёт шаг планировщика по записи
      // в storage_orphans (ADR-0079), а учитель отказа не увидел.
      expect(store.objects.size).toBe(1);
    });
  });
});
