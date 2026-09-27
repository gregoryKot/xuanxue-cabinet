// Фейк ExamVideosService (ADR-0133) для спеков, которым нужен ExamItemsService,
// но не нужно реальное R2 (та же причина, что у fake-storage-orphans.ts):
// поведение самого ExamVideosService проверяется отдельно
// (exam-videos.service.spec.ts, exam-videos.e2e-spec.ts).
//
// Общий хелпер, а не копия в каждом спеке (CLAUDE.md «Дубли», jscpd) —
// ExamItemsService конструируют несколько разных спеков.
import type { ExamVideosService } from '../exam-videos/exam-videos.service';

export function fakeExamVideosService(): ExamVideosService {
  return {
    assertExist: jest.fn().mockResolvedValue(undefined),
  } as unknown as ExamVideosService;
}
