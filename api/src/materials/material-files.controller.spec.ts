// Test.createTestingModule с фейком сервиса — образец
// materials.controller.spec.ts: без HTTP и без Mongo. Роли, 302 на
// подписанную ссылку и «закрытый материал файла не отдаёт» проверяет e2e
// (api/test/material-files.e2e-spec.ts).
import { DateTime } from 'luxon';
import { Test } from '@nestjs/testing';
import type { MaterialDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { MaterialFilesController } from './material-files.controller';
import { MaterialFilesService } from './material-files.service';

const MATERIAL_DTO: MaterialDto = {
  id: 'm1',
  title: 'Методичка',
  url: 'https://example.com/book',
  kind: 'document',
  classIds: [],
  lessonIds: [],
  access: 'all',
  tags: [],
  createdBy: 't1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const TEACHER: UserLean = {
  id: 't1',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
};
const STUDENT: UserLean = {
  id: 's1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

function fakeResponse(): {
  headers: Record<string, string>;
  code: number | null;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => void;
} {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    code: null as number | null,
    setHeader: (name: string, value: string): void => {
      headers[name] = value;
    },
    status: (code: number): void => {
      res.code = code;
    },
  };
  return res;
}

async function buildController(
  service: Partial<MaterialFilesService> = {},
): Promise<MaterialFilesController> {
  const module = await Test.createTestingModule({
    controllers: [MaterialFilesController],
    providers: [{ provide: MaterialFilesService, useValue: service }],
  }).compile();
  return module.get(MaterialFilesController);
}

describe('MaterialFilesController', () => {
  it('upload() отдаёт сервису сырое тело, id и имя из query', async () => {
    const upload = jest.fn().mockResolvedValue(MATERIAL_DTO);
    const controller = await buildController({ upload });
    const body = Buffer.from('%PDF-1.7');

    const dto = await controller.upload('m1', { name: 'Методичка.pdf' }, { body });

    expect(dto).toBe(MATERIAL_DTO);
    expect(upload).toHaveBeenCalledWith(
      'm1',
      body,
      'Методичка.pdf',
      expect.any(DateTime),
    );
  });

  it('detach() передаёт id и момент времени', async () => {
    const detach = jest.fn().mockResolvedValue(MATERIAL_DTO);
    const controller = await buildController({ detach });

    await controller.detach('m1');

    expect(detach).toHaveBeenCalledWith('m1', expect.any(DateTime));
  });

  // Подписанная ссылка живёт минуты — редирект нельзя ни кешировать, ни
  // отдавать телом ответа (ADR-0057).
  it('download() ставит 302, Location и no-store', async () => {
    const url =
      'https://acc.r2.cloudflarestorage.com/b/materials/m1/f?X-Amz-Signature=ab';
    const signedUrl = jest.fn().mockResolvedValue(url);
    const controller = await buildController({ signedUrl });
    const res = fakeResponse();

    await controller.download('m1', STUDENT, res);

    expect(res.code).toBe(302);
    expect(res.headers.Location).toBe(url);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('download() сообщает сервису, штат это или нет — право решает он', async () => {
    const signedUrl = jest.fn().mockResolvedValue('https://example.com/signed');
    const controller = await buildController({ signedUrl });

    await controller.download('m1', STUDENT, fakeResponse());
    await controller.download('m1', TEACHER, fakeResponse());

    expect(signedUrl).toHaveBeenNthCalledWith(1, 'm1', false, expect.any(DateTime));
    expect(signedUrl).toHaveBeenNthCalledWith(2, 'm1', true, expect.any(DateTime));
  });
});
