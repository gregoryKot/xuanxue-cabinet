// Чистая логика без Mongo/DI/HTTP-сервера (CLAUDE.md «Тесты») — middleware
// проверяется напрямую, через фейковый `res.setHeader`.
import { APP_VERSION_HEADER } from '@xuanxue/shared';
import { makeAppVersionHeader } from './app-version-header';

function fakeRes() {
  const setHeader = jest.fn();
  return { res: { setHeader }, setHeader };
}

describe('makeAppVersionHeader', () => {
  it('версия задана — ставит заголовок и зовёт next()', () => {
    const { res, setHeader } = fakeRes();
    const next = jest.fn();
    const middleware = makeAppVersionHeader('abc1234');

    middleware({}, res, next);

    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith(APP_VERSION_HEADER, 'abc1234');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('версии нет — setHeader не вызывается, next() всё равно зовётся', () => {
    const { res, setHeader } = fakeRes();
    const next = jest.fn();
    const middleware = makeAppVersionHeader(undefined);

    middleware({}, res, next);

    expect(setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
