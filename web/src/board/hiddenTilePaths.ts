// Какие GET-запросы главной не нужны, потому что человек скрыл плитку
// (ADR-0179): прогрев первого экрана (app/prefetchFirstScreen.ts) обязан
// повторять то, что экран реально запросит, иначе промис, который никто не
// заберёт, протухнет в prefetchCache. Экзамены не в списке: `GET /me/exams`
// нужен пункту «Задания» в панели, и скрытая плитка его не отменяет.
import type { HomeTileKey, MeDto } from '@xuanxue/shared';
import { MY_LESSONS_PATH, SETTINGS_PATH } from '../api/apiPaths';
import { MY_BOARD_PATH } from '../api/boardApiPaths';
import { MY_EVENTS_PATH, SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import { GRADING_QUEUE_PATH } from '../api/gradingPaths';
import { MY_PAYMENTS_PATH } from '../api/paymentsApiPaths';
import { isTeacher } from '../app/screenAccess';

type TilePaths = Partial<Record<HomeTileKey, string>>;

const STUDENT_TILE_PATH: TilePaths = {
  nextLesson: MY_LESSONS_PATH,
  notice: MY_BOARD_PATH,
  payment: MY_PAYMENTS_PATH,
  events: MY_EVENTS_PATH,
};

const STAFF_TILE_PATH: TilePaths = {
  notice: SETTINGS_PATH,
  grading: GRADING_QUEUE_PATH,
  events: SCHOOL_EVENTS_PATH,
};

/** Пути скрытых плиток той главной, которую человек увидит (`isTeacher`: штат
 * в режиме ученика видит главную ученика, ADR-0163). */
export function hiddenTilePaths(me: MeDto): string[] {
  const table = isTeacher(me) ? STAFF_TILE_PATH : STUDENT_TILE_PATH;
  return me.homeHiddenTiles.flatMap((key) => table[key] ?? []);
}
