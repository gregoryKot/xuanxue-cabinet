// Чистые функции разбора запроса (CLAUDE.md «Тесты»): свои предикаты сырого
// тела (exam-image-body.ts, material-file-body.ts) опираются на них, и
// краевые случаи заголовков надёжнее проверить здесь, а не по разу в каждом.
import { mediaType, routePath } from './raw-body-route';

describe('routePath', () => {
  it('отрезает query', () => {
    expect(routePath('/api/materials/abc/file?name=x.pdf')).toBe(
      '/api/materials/abc/file',
    );
  });

  it('отрезает завершающий слэш', () => {
    expect(routePath('/api/exam-images/')).toBe('/api/exam-images');
  });

  it('одинокий слэш остаётся собой', () => {
    expect(routePath('/')).toBe('/');
  });

  it('url не пришёл — пустая строка, не падение', () => {
    expect(routePath(undefined)).toBe('');
  });
});

describe('mediaType', () => {
  it('отрезает параметры и приводит к нижнему регистру', () => {
    expect(mediaType('Application/PDF; charset=utf-8')).toBe('application/pdf');
  });

  // Node склеивает дубли заголовка, но тип из IncomingMessage допускает
  // массив — на нём предикат обязан ответить «нет», а не упасть.
  it('массив значений — пустая строка', () => {
    expect(mediaType(['application/pdf', 'image/png'])).toBe('');
  });

  it('заголовка нет — пустая строка', () => {
    expect(mediaType(undefined)).toBe('');
  });
});
