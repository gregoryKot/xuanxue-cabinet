// Test.createTestingModule с фейком сервиса — образец summary.controller.spec.ts:
// без HTTP, без Mongo. Роли проверяет e2e (tags.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import type { TagSummaryDto } from '@xuanxue/shared';
import { ListTagsDto } from './dto/list-tags.dto';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

const TAGS: TagSummaryDto[] = [{ tag: 'дракон', lessonCount: 3, materialCount: 1 }];

async function buildController(
  service: Partial<TagsService> = {},
): Promise<TagsController> {
  const module = await Test.createTestingModule({
    controllers: [TagsController],
    providers: [{ provide: TagsService, useValue: service }],
  }).compile();
  return module.get(TagsController);
}

describe('TagsController', () => {
  it('list() передаёт query сервису как есть и отдаёт его результат', async () => {
    const list = jest.fn().mockResolvedValue(TAGS);
    const controller = await buildController({ list });
    const query: ListTagsDto = { limit: 10 };

    await expect(controller.list(query)).resolves.toEqual(TAGS);
    expect(list).toHaveBeenCalledWith(query);
  });
});
