import { describe, expect, it } from 'vitest';
import { activeSectionPath } from './navItems';

describe('activeSectionPath', () => {
  it('сам раздел подсвечивает себя', () => {
    expect(activeSectionPath('/planning')).toBe('/planning');
  });

  it('/schedule — подэкран «Занятий»', () => {
    expect(activeSectionPath('/schedule')).toBe('/planning');
  });

  it('/channels и /templates — подэкраны «Рассылок»', () => {
    expect(activeSectionPath('/channels')).toBe('/broadcasts');
    expect(activeSectionPath('/templates')).toBe('/broadcasts');
  });

  it('/exam-items — подэкран «Экзаменов»', () => {
    expect(activeSectionPath('/exam-items')).toBe('/exams');
  });

  it('путь вне навигации — null', () => {
    expect(activeSectionPath('/login')).toBeNull();
  });
});
