// `/me/materials` зовёт тот же MaterialsService, но другой метод —
// listForStudent, а не list: перепутанный вызов отдал бы ученику createdBy и
// access (ADR-0048). Фейк сервиса, без HTTP и Mongo, как у
// MaterialsController.
import { Test } from '@nestjs/testing';
import type { MyMaterialDto } from '@xuanxue/shared';
import { MaterialsService } from './materials.service';
import { MyMaterialsController } from './my-materials.controller';

const MY_MATERIAL_DTO: MyMaterialDto = {
  id: 'm1',
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  kind: 'book',
  classIds: [],
  url: 'https://example.com/book',
};

describe('MyMaterialsController', () => {
  it('list() зовёт listForStudent и отдаёт его результат', async () => {
    const listForStudent = jest.fn().mockResolvedValue([MY_MATERIAL_DTO]);
    const module = await Test.createTestingModule({
      controllers: [MyMaterialsController],
      providers: [{ provide: MaterialsService, useValue: { listForStudent } }],
    }).compile();
    const controller = module.get(MyMaterialsController);

    await expect(controller.list({ limit: 5 })).resolves.toEqual([MY_MATERIAL_DTO]);
    expect(listForStudent).toHaveBeenCalledWith({ limit: 5 });
  });
});
