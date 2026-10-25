import { hasLessonLink } from './lesson-link';

describe('hasLessonLink', () => {
  it('ссылка класса — есть', () => {
    expect(hasLessonLink({}, { zoomLink: 'https://zoom.example/1' })).toBe(true);
  });

  it('разовая ссылка занятия без ссылки класса — есть', () => {
    expect(hasLessonLink({ zoomLinkOverride: 'https://zoom.example/2' }, {})).toBe(true);
  });

  it('ни у класса, ни у занятия — нет', () => {
    expect(hasLessonLink({}, {})).toBe(false);
  });

  it('пустая разовая ссылка не заслоняет отсутствие ссылки класса', () => {
    // Тот же `??`, что у планировщика рассылок: пустая строка — «ссылки нет»,
    // а не «есть, но пустая».
    expect(hasLessonLink({ zoomLinkOverride: '' }, {})).toBe(false);
  });
});
