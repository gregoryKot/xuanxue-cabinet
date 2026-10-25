// Один шаг тика «видео-сироты» на все виды видео школы: вопросы и варианты
// (ExamVideoSweepService, ADR-0133) и записи занятий (LessonVideoSweepService,
// ADR-0180). Вид, который упал, не останавливает другой: оба идут до конца, а
// первая ошибка поднимается наверх — шаг тика залогирует её и сообщит учителю
// (scheduler-step.ts). Отдельным провайдером, а не новым параметром
// SchedulerService: файл тика стоит на потолке храповика размера.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { ExamVideoSweepService } from '../exam-videos/exam-video-sweep.service';
import { LessonVideoSweepService } from '../lesson-videos/lesson-video-sweep.service';

@Injectable()
export class VideoOrphansSweepService {
  constructor(
    private readonly examVideos: ExamVideoSweepService,
    private readonly lessonVideos: LessonVideoSweepService,
  ) {}

  async removeOrphans(now: DateTime): Promise<{ removed: number }> {
    const results = await Promise.allSettled([
      this.examVideos.removeOrphans(now),
      this.lessonVideos.removeOrphans(now),
    ]);
    let removed = 0;
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      removed += result.value.removed;
    }
    return { removed };
  }
}
