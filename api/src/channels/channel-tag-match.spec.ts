// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { channelAcceptsLessonTags } from './channel-tag-match';

describe('channelAcceptsLessonTags', () => {
  it('у канала нет тегов — принимает всё, даже если у даты занятия тегов тоже нет', () => {
    expect(channelAcceptsLessonTags([], [])).toBe(true);
    expect(channelAcceptsLessonTags([], ['новички'])).toBe(true);
  });

  it('общий тег даты занятия — принимает', () => {
    expect(channelAcceptsLessonTags(['новички'], ['новички'])).toBe(true);
  });

  it('тег занятия в расписании (не свой тег даты) — тоже принимает: теги даты и занятия объединяются вызывающим', () => {
    expect(channelAcceptsLessonTags(['начинающие'], ['вечер', 'начинающие'])).toBe(true);
  });

  it('без учёта регистра — «Новички» и «новички» совпадают', () => {
    expect(channelAcceptsLessonTags(['Новички'], ['новички'])).toBe(true);
    expect(channelAcceptsLessonTags(['новички'], ['НОВИЧКИ'])).toBe(true);
  });

  it('нет пересечения — не принимает', () => {
    expect(channelAcceptsLessonTags(['средние'], ['новички'])).toBe(false);
  });

  it('у канала есть теги, у даты занятия тегов нет — не принимает', () => {
    expect(channelAcceptsLessonTags(['новички'], [])).toBe(false);
  });
});
