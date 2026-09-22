export type LearningCommandType =
  | 'SUBMIT_LESSON_ATTEMPT'
  | 'SUBMIT_REVIEW_CARD'
  | 'SUBMIT_REFLECTION';

export interface LearningCommand {
  command_id: string; // UUID (canonical UUIDv7)
  installation_id: string;
  client_seq: number;
  command_type: LearningCommandType;
  payload: Record<string, any>;
  client_timestamp: string;
}

export type SyncReceiptStatus =
  | 'ACCEPTED'
  | 'QUARANTINED'
  | 'REJECTED'
  | 'DUPLICATE';

export interface CommandReceipt {
  command_id: string;
  client_seq: number;
  status: SyncReceiptStatus;
  result_payload: any;
  error_message?: string | undefined;
  processed_at: string;
}

export interface SyncBatchRequest {
  commands: LearningCommand[];
}

export interface SyncBatchResponse {
  synced_count: number;
  accepted_count: number;
  quarantined_count: number;
  rejected_count: number;
  duplicate_count: number;
  receipts: CommandReceipt[];
}
