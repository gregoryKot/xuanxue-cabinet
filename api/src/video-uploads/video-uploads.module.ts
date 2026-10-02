// Ядро загрузки видео частями (ADR-0165) — без контроллеров и маршрутов: адреса
// и права у домена, чьи видео лежат в R2 (answer-videos/, дальше exam-videos/).
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { VideoUploadsService } from './video-uploads.service';

@Module({
  imports: [StorageModule],
  providers: [VideoUploadsService],
  exports: [VideoUploadsService],
})
export class VideoUploadsModule {}
