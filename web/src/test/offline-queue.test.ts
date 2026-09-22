import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateUUIDv7,
  enqueueCommand,
  getPendingCommands,
  removeCommand,
  syncPendingCommands,
} from '../services/offline-queue';

describe('Offline Queue & UUIDv7 Synchronization', () => {
  beforeEach(async () => {
    // Clear pending commands
    const existing = await getPendingCommands();
    for (const cmd of existing) {
      await removeCommand(cmd.command_id);
    }
  });

  it('generates compliant UUIDv7 strings', () => {
    const id = generateUUIDv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('enqueues command into IndexedDB and increments client_seq', async () => {
    const cmd1 = await enqueueCommand('SUBMIT_LESSON_ATTEMPT', { lesson_id: 'L-01' });
    const cmd2 = await enqueueCommand('SUBMIT_SRS_REVIEW', { review_card_id: 'RC-01', rating: 3 });

    expect(cmd1.command_id).toBeDefined();
    expect(cmd2.client_seq).toBeGreaterThan(cmd1.client_seq);

    const pending = await getPendingCommands();
    expect(pending.length).toBe(2);
    expect(pending[0].command_id).toBe(cmd1.command_id);
    expect(pending[1].command_id).toBe(cmd2.command_id);
  });

  it('syncs pending commands with server and removes accepted commands from queue', async () => {
    const cmd = await enqueueCommand('SUBMIT_LESSON_ATTEMPT', { lesson_id: 'L-01', score: 90 });

    // Mock global fetch for POST /api/v1/learning/sync
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sync_status: 'SUCCESS',
        server_timestamp: new Date().toISOString(),
        results: [
          {
            command_id: cmd.command_id,
            status: 'ACCEPTED',
            details: { is_passed: true, new_node_state: 'COMPLETED' },
          },
        ],
      }),
    } as Response);

    const { synced, failed } = await syncPendingCommands('/api/v1/learning/sync');
    expect(synced).toBe(1);
    expect(failed).toBe(0);

    const remaining = await getPendingCommands();
    expect(remaining.length).toBe(0);
  });
});
