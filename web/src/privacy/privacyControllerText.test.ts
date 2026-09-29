// Раздел «Кто отвечает за данные» — чистая логика без DOM (пункт 2а статьи 11
// Закона о защите частной жизни Израиля, ADR-0155). Как он рисуется на
// странице и откуда берёт имя — PrivacyScreen.test.tsx.
import { describe, expect, it } from 'vitest';
import { buildControllerParagraphs } from './privacyControllerText';

describe('buildControllerParagraphs — пункт 2а: кто отвечает за данные', () => {
  it('имя и контакт указаны — оба на странице, выделены как факты', () => {
    expect(
      buildControllerParagraphs({
        dataControllerName: 'Дмитрий Дейч',
        dataControllerContact: 'privacy@xuanxue.su',
      }),
    ).toEqual([
      'За данные учеников отвечает **Дмитрий Дейч**.',
      'Связаться по вопросам о ваших данных: **privacy@xuanxue.su**.',
    ]);
  });

  it('только имя — способ связи честно отправляет к учителю', () => {
    const paragraphs = buildControllerParagraphs({
      dataControllerName: 'Школа Сюань-Сюэ',
    });

    expect(paragraphs[0]).toBe('За данные учеников отвечает **Школа Сюань-Сюэ**.');
    expect(paragraphs[1]).toContain('**спросите учителя школы**');
  });

  it('только контакт — имени нет, но связаться можно', () => {
    expect(
      buildControllerParagraphs({ dataControllerContact: '@dmitry_deitch' }),
    ).toEqual(['Связаться по вопросам о ваших данных: **@dmitry_deitch**.']);
  });

  it('школа ничего не указала — одна честная строка, ни выдуманного имени, ни пустоты', () => {
    const paragraphs = buildControllerParagraphs({});

    expect(paragraphs).toEqual([
      'Имя и контакт ответственного школа ещё не указала — **спросите учителя школы**.',
    ]);
  });

  it('настройки не загрузились — страница отправляет к учителю и предлагает обновить', () => {
    const [paragraph] = buildControllerParagraphs(null);

    expect(paragraph).toContain('Не удалось загрузить');
    expect(paragraph).toContain('**спросите учителя школы**');
  });

  // Имя и контакт вводит школа: звёздочки из ввода склеили бы чужие пары
  // акцентов (RichText.tsx), а ссылку с маркером поверх RichText оставил бы
  // звёздочками на экране.
  it('звёздочки из ввода убираются, адрес-ссылка идёт без выделения', () => {
    const paragraphs = buildControllerParagraphs({
      dataControllerName: '**Дмитрий** *Дейч*',
      dataControllerContact: 'https://t.me/xuanxue',
    });

    expect(paragraphs).toEqual([
      'За данные учеников отвечает **Дмитрий Дейч**.',
      'Связаться по вопросам о ваших данных: https://t.me/xuanxue.',
    ]);
  });
});
