// Отказы R2, которые вызывающему коду нужно отличать от общего «хранилище
// недоступно» (r2-request.ts).
import { NotAvailableError } from '../common/errors';

/** R2 ответил `NoSuchUpload`: загрузку частями он не знает — её уже собрали
 * (повтор `complete` после сбоя Mongo, аудит 2026-10-01, F47) или прервали.
 * Наследует NotAvailableError: код, который с этим не умеет работать, получает
 * прежний 503, а не новый вид ошибки. */
export class MultipartUploadGoneError extends NotAvailableError {}
