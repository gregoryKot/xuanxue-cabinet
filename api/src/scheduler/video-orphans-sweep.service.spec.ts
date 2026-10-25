// Один шаг тика «видео-сироты» на все виды видео (ADR-0180): сумма убранного,
// и сбой одного вида не оставляет другой необслуженным. Сами уборщики проверены
// своими спеками против Mongo — здесь только склейка, на фейках.
import { DateTime } from 'luxon';
import type { ExamVideoSweepService } from '../exam-videos/exam-video-sweep.service';
import type { LessonVideoSweepService } from '../lesson-videos/lesson-video-sweep.service';
import { VideoOrphansSweepService } from './video-orphans-sweep.service';

const NOW = DateTime.utc(2026, 10, 10, 12, 0, 0);

function build(exam: jest.Mock, lesson: jest.Mock): VideoOrphansSweepService {
  return new VideoOrphansSweepService(
    { removeOrphans: exam } as unknown as ExamVideoSweepService,
    { removeOrphans: lesson } as unknown as LessonVideoSweepService,
  );
}

describe('VideoOrphansSweepService', () => {
  it('складывает убранное по видео вопросов и по записям занятий', async () => {
    const exam = jest.fn().mockResolvedValue({ removed: 2 });
    const lesson = jest.fn().mockResolvedValue({ removed: 3 });

    await expect(build(exam, lesson).removeOrphans(NOW)).resolves.toEqual({ removed: 5 });
    expect(exam).toHaveBeenCalledWith(NOW);
    expect(lesson).toHaveBeenCalledWith(NOW);
  });

  it('упал вид вопросов — записи занятий всё равно убраны, ошибка поднимается наверх', async () => {
    const exam = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const lesson = jest.fn().mockResolvedValue({ removed: 1 });

    await expect(build(exam, lesson).removeOrphans(NOW)).rejects.toThrow('mongo упал');
    expect(lesson).toHaveBeenCalledTimes(1);
  });

  it('упал вид записей занятий — вопросы всё равно убраны', async () => {
    const exam = jest.fn().mockResolvedValue({ removed: 4 });
    const lesson = jest.fn().mockRejectedValue(new Error('r2 упал'));

    await expect(build(exam, lesson).removeOrphans(NOW)).rejects.toThrow('r2 упал');
    expect(exam).toHaveBeenCalledTimes(1);
  });
});
