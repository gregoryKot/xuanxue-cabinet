// Query GET /exam-videos/:id и GET /answer-videos/:id (ADR-0165). Значение,
// кроме `1`, — 400: ссылку «Скачать» собираем сами (shared), чужое значение —
// опечатка, а не повод молча отдать просмотр вместо скачивания.
import { IsIn, IsOptional } from 'class-validator';
import { VIDEO_DOWNLOAD_QUERY_VALUE, type VideoDownloadQuery } from '@xuanxue/shared';

export class VideoDownloadQueryDto implements VideoDownloadQuery {
  @IsOptional()
  @IsIn([VIDEO_DOWNLOAD_QUERY_VALUE])
  download?: typeof VIDEO_DOWNLOAD_QUERY_VALUE;
}
