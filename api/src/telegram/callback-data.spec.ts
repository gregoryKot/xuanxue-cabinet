// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { inlineButton, parseCallbackData } from './callback-data';

describe('parseCallbackData', () => {
  it('разбирает действие и параметр', () => {
    expect(parseCallbackData('cancel:64f000000000000000000001')).toEqual({
      action: 'cancel',
      id: '64f000000000000000000001',
    });
  });

  it('неизвестное действие — null', () => {
    expect(parseCallbackData('unknown:1')).toBeNull();
  });

  it('без разделителя — null', () => {
    expect(parseCallbackData('cancel')).toBeNull();
  });

  it('пустой параметр — null', () => {
    expect(parseCallbackData('cancel:')).toBeNull();
  });

  it('notif: — параметр вида уведомления, не ObjectId', () => {
    expect(parseCallbackData('notif:post_draft')).toEqual({
      action: 'notif',
      id: 'post_draft',
    });
  });
});

describe('inlineButton', () => {
  it('собирает кнопку с callback_data по формату действие:параметр', () => {
    expect(inlineButton('Отменить', 'cancel', 'b1')).toEqual({
      text: 'Отменить',
      callback_data: 'cancel:b1',
    });
  });
});
