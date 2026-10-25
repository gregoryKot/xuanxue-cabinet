import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { NativeNoStoreInterceptor } from './native-response';

describe('NativeNoStoreInterceptor', () => {
  it('ставит no-store и no-cache до обработчика и не трогает ответ', async () => {
    const headers = new Map<string, string | number>();
    const res = {
      setHeader: (name: string, value: string | number) => headers.set(name, value),
    };
    const context = {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ExecutionContext;
    let seenByHandler: Map<string, string | number> | undefined;
    const next: CallHandler = {
      handle: () => {
        seenByHandler = new Map(headers);
        return of('тело');
      },
    };

    const body = await lastValueFrom(
      new NativeNoStoreInterceptor().intercept(context, next),
    );

    expect(body).toBe('тело');
    expect(seenByHandler).toEqual(
      new Map([
        ['Cache-Control', 'no-store'],
        ['Pragma', 'no-cache'],
      ]),
    );
  });
});
