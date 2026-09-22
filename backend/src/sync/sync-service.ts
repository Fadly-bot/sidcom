import { IDatabase, getDb } from '../db/index.js';
import { LearningService } from '../learning/learning-service.js';
import { SrsService } from '../srs/srs-service.js';
import {
  CommandReceipt,
  LearningCommand,
  SyncBatchResponse,
  SyncReceiptStatus
} from './types.js';
import { ValidationError } from '../errors/app-error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SyncService {
  private dbInstance: IDatabase | undefined;

  constructor(db?: IDatabase) {
    this.dbInstance = db;
  }

  private get db(): IDatabase {
    return this.dbInstance ?? getDb();
  }

  private get learningService(): LearningService {
    return new LearningService(this.db);
  }

  private get srsService(): SrsService {
    return new SrsService(this.db);
  }

  /**
   * Validates structural compliance of a LearningCommand envelope.
   */
  validateCommand(cmd: LearningCommand): void {
    if (!cmd.command_id || !UUID_REGEX.test(cmd.command_id)) {
      throw new ValidationError(`Invalid command_id: '${cmd.command_id}'. Must be a valid UUIDv7 format.`, [
        { field: 'command_id', message: 'Must be a valid UUID' }
      ]);
    }

    if (!cmd.installation_id || typeof cmd.installation_id !== 'string' || cmd.installation_id.length < 3) {
      throw new ValidationError('Invalid installation_id: must be at least 3 characters', [
        { field: 'installation_id', message: 'Must be at least 3 characters' }
      ]);
    }

    if (typeof cmd.client_seq !== 'number' || !Number.isInteger(cmd.client_seq) || cmd.client_seq < 1) {
      throw new ValidationError(`Invalid client_seq: '${cmd.client_seq}'. Must be a positive integer.`, [
        { field: 'client_seq', message: 'Must be a positive integer >= 1' }
      ]);
    }

    if (!['SUBMIT_LESSON_ATTEMPT', 'SUBMIT_REVIEW_CARD', 'SUBMIT_REFLECTION'].includes(cmd.command_type)) {
      throw new ValidationError(`Unsupported command_type: '${cmd.command_type}'`, [
        { field: 'command_type', message: 'Unsupported command type' }
      ]);
    }

    if (!cmd.payload || typeof cmd.payload !== 'object') {
      throw new ValidationError('Command payload must be an object', [
        { field: 'payload', message: 'Must be an object' }
      ]);
    }

    if (!cmd.client_timestamp || isNaN(Date.parse(cmd.client_timestamp))) {
      throw new ValidationError('Invalid client_timestamp: must be a valid ISO 8601 date string', [
        { field: 'client_timestamp', message: 'Must be a valid ISO 8601 date string' }
      ]);
    }
  }

  /**
   * Authoritatively processes a batch of 1..N LearningCommands with:
   * 1. Monotonic ordering by client_seq ASC
   * 2. Strict UUIDv7 idempotency via processed_commands ledger
   * 3. Partial success tolerance
   * 4. Monotonic quarantine enforcement (sub-15m retries marked QUARANTINED)
   */
  async syncBatch(userId: string, commands: LearningCommand[]): Promise<SyncBatchResponse> {
    if (!Array.isArray(commands) || commands.length === 0) {
      return {
        synced_count: 0,
        accepted_count: 0,
        quarantined_count: 0,
        rejected_count: 0,
        duplicate_count: 0,
        receipts: []
      };
    }

    // 1. Structural validation of all commands in batch
    for (const cmd of commands) {
      this.validateCommand(cmd);
    }

    // 2. Strict ordered processing: sort by client_seq ASC
    const orderedCommands = [...commands].sort((a, b) => a.client_seq - b.client_seq);

    const receipts: CommandReceipt[] = [];
    let acceptedCount = 0;
    let quarantinedCount = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;

    for (const cmd of orderedCommands) {
      // 3. Idempotency check: inspect processed_commands ledger
      const existingCmd = await this.db.query<{
        command_id: string;
        status: string;
        response_payload: any;
        processed_at: string;
      }>(
        'SELECT command_id, status, response_payload, processed_at FROM processed_commands WHERE command_id = $1 AND user_id = $2;',
        [cmd.command_id, userId]
      );

      const existingRow = existingCmd.rows[0];
      if (existingRow) {
        // Already processed -> return cached receipt without re-execution (idempotent replay)
        receipts.push({
          command_id: cmd.command_id,
          client_seq: cmd.client_seq,
          status: 'DUPLICATE',
          result_payload: existingRow.response_payload,
          processed_at: existingRow.processed_at
        });
        duplicateCount += 1;
        continue;
      }

      // 4. Domain dispatch & execution
      let receiptStatus: SyncReceiptStatus = 'ACCEPTED';
      let resultPayload: any = null;
      let errorMessage: string | undefined;

      try {
        if (cmd.command_type === 'SUBMIT_LESSON_ATTEMPT') {
          const lessonId = cmd.payload['lesson_id'];
          const answers = cmd.payload['answers'] ?? [];
          const elapsed = cmd.payload['elapsed_active_seconds'] ?? 0;

          const result = await this.learningService.submitLessonAttempt(userId, {
            lesson_id: lessonId,
            answers,
            elapsed_active_seconds: elapsed,
            client_timestamp: cmd.client_timestamp
          });

          resultPayload = result;

          if (result.provisional_study) {
            // Quarantine cool-down or bot speed detected!
            receiptStatus = 'QUARANTINED';
            quarantinedCount += 1;
          } else {
            receiptStatus = 'ACCEPTED';
            acceptedCount += 1;
          }
        } else if (cmd.command_type === 'SUBMIT_REVIEW_CARD') {
          const cardId = cmd.payload['review_card_id'];
          const score = cmd.payload['score_percentage'] ?? 0;
          const rating = cmd.payload['rating'];
          const elapsed = cmd.payload['elapsed_active_seconds'];

          const result = await this.srsService.processReviewSubmission(userId, {
            review_card_id: cardId,
            score_percentage: score,
            rating,
            elapsed_active_seconds: elapsed
          });

          resultPayload = result;
          receiptStatus = 'ACCEPTED';
          acceptedCount += 1;
        } else if (cmd.command_type === 'SUBMIT_REFLECTION') {
          resultPayload = {
            acknowledged: true,
            reflection: cmd.payload['reflection']
          };
          receiptStatus = 'ACCEPTED';
          acceptedCount += 1;
        }
      } catch (err: any) {
        // Partial failure: record REJECTED receipt without corrupting the batch
        receiptStatus = 'REJECTED';
        errorMessage = err.message ?? 'Command processing failed';
        resultPayload = null;
        rejectedCount += 1;
      }

      const nowIso = new Date().toISOString();

      // 5. Persist command outcome into processed_commands ledger
      await this.db.query(
        `INSERT INTO processed_commands (
          command_id, user_id, command_type, status, response_payload, processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (command_id) DO NOTHING;`,
        [
          cmd.command_id,
          userId,
          cmd.command_type,
          receiptStatus,
          JSON.stringify(resultPayload),
          nowIso
        ]
      );

      receipts.push({
        command_id: cmd.command_id,
        client_seq: cmd.client_seq,
        status: receiptStatus,
        result_payload: resultPayload,
        error_message: errorMessage,
        processed_at: nowIso
      });
    }

    return {
      synced_count: receipts.length,
      accepted_count: acceptedCount,
      quarantined_count: quarantinedCount,
      rejected_count: rejectedCount,
      duplicate_count: duplicateCount,
      receipts
    };
  }
}
