// Контроллер входа из wiki без HTTP-стека: отдаёт исход сервиса как есть,
// маршрут публичный и под своим фильтром 429. Ответы целиком — e2e wiki-entry-*.
import { EXCEPTION_FILTERS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth/auth.decorators';
import {
  WikiEntryThrottleFilter,
  type WikiEntryResponseLike,
} from './wiki-entry-response';
import { WikiEntryController } from './wiki-entry.controller';
import { WikiEntryModule } from './wiki-entry.module';
import type { WikiEntryService } from './wiki-entry.service';

describe('WikiEntryController', () => {
  it('передаёт запрос сервису и отправляет его исход', async () => {
    const enter = jest.fn().mockResolvedValue({
      kind: 'redirect',
      location: 'https://wiki.xuanxue.su/',
    });
    const service = { enter } satisfies Pick<WikiEntryService, 'enter'>;
    const headers: Record<string, unknown> = {};
    let statusCode: number | undefined;
    const res: WikiEntryResponseLike = {
      status(code) {
        statusCode = code;
        return res;
      },
      setHeader(name, value) {
        headers[name] = value;
      },
      getHeader: () => undefined,
      end: () => undefined,
    };
    const req = { headers: {}, originalUrl: '/wiki' };

    await new WikiEntryController(service as unknown as WikiEntryService).enter(req, res);

    expect(enter).toHaveBeenCalledWith(req, expect.anything());
    expect(statusCode).toBe(HttpStatus.SEE_OTHER);
    expect(headers.Location).toBe('https://wiki.xuanxue.su/');
  });

  it('@Public() и фильтр 429 на контроллере, контроллер — в модуле', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WikiEntryController)).toBe(true);
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, WikiEntryController)).toEqual([
      WikiEntryThrottleFilter,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WikiEntryModule)).toEqual([
      WikiEntryController,
    ]);
  });
});
