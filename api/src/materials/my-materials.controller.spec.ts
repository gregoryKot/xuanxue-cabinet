// `/me/materials` зовёт тот же MaterialsService, но другой метод —
// listForStudent, а не list: перепутанный вызов отдал бы ученику createdBy и
// access (ADR-0048). Фейк сервиса, без HTTP и Mongo, как у
// MaterialsController. Роль/доступ по факту (штат видит closed материалы)
// проверяет e2e (materials-access.e2e-spec.ts) на настоящем гварде — здесь
// только «контроллер вычисляет isStaff и зовёт сервис».
import { Test } from '@nestjs/testing';
import type { MyMaterialDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { MaterialsService } from './materials.service';
import { MyMaterialsController } from './my-materials.controller';

const MY_MATERIAL_DTO: MyMaterialDto = {
  id: 'm1',
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  kind: 'book',
  classTitles: [],
  tags: [],
  url: 'https://example.com/book',
};

const STUDENT: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
};

const TEACHER: UserLean = { ...STUDENT, id: 'u2', roles: ['teacher'] };

async function buildController(
  listForStudent: jest.Mock = jest.fn().mockResolvedValue([MY_MATERIAL_DTO]),
): Promise<MyMaterialsController> {
  const module = await Test.createTestingModule({
    controllers: [MyMaterialsController],
    providers: [{ provide: MaterialsService, useValue: { listForStudent } }],
  }).compile();
  return module.get(MyMaterialsController);
}

describe('MyMaterialsController', () => {
  it('list() зовёт listForStudent с isStaff=false для ученика и отдаёт его результат', async () => {
    const listForStudent = jest.fn().mockResolvedValue([MY_MATERIAL_DTO]);
    const controller = await buildController(listForStudent);

    await expect(controller.list({ limit: 5 }, STUDENT)).resolves.toEqual([
      MY_MATERIAL_DTO,
    ]);
    expect(listForStudent).toHaveBeenCalledWith({ limit: 5 }, false);
  });

  it('list() зовёт listForStudent с isStaff=true для учителя', async () => {
    const listForStudent = jest.fn().mockResolvedValue([MY_MATERIAL_DTO]);
    const controller = await buildController(listForStudent);

    await controller.list({}, TEACHER);

    expect(listForStudent).toHaveBeenCalledWith({}, true);
  });
});
