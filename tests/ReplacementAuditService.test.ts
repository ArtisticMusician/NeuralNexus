import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReplacementAuditService } from '../src/core/ReplacementAuditService.js';
import fs from 'node:fs/promises';

describe('ReplacementAuditService (Real SQLite Integration)', () => {
  let service: ReplacementAuditService;
  const testDbPath = './data/test_audit.sqlite';

  beforeEach(async () => {
    // Ensure data directory exists
    await fs.mkdir('./data', { recursive: true }).catch(() => { });
    // Start fresh for each test
    service = new ReplacementAuditService(true, testDbPath);
    await service.initialize();
  });

  afterEach(async () => {
    await service.close();
    await fs.unlink(testDbPath).catch(() => { });
  });

  it('actually stores and retrieves logs from a real database', async () => {
    const record = {
      memoryId: 'mem-123',
      category: 'preference',
      oldText: 'I like apples',
      newText: 'I like oranges',
      similarityScore: 0.95,
      replacedAt: Date.now(),
    };

    await service.logReplacement(record);
    const logs = await service.getLogs(10);

    expect(logs).toHaveLength(1);
    expect(logs[0].memory_id).toBe('mem-123');
    expect(logs[0].old_text).toBe('I like apples');
    expect(logs[0].new_text).toBe('I like oranges');
  });

  it('respects the limit parameter in getLogs', async () => {
    for (let i = 0; i < 5; i++) {
      await service.logReplacement({
        memoryId: `id-${i}`,
        category: 'fact',
        oldText: 'old',
        newText: 'new',
        similarityScore: 0.9,
        replacedAt: Date.now() + i,
      });
    }

    const limitedLogs = await service.getLogs(2);
    expect(limitedLogs).toHaveLength(2);
    // Should be most recent first
    expect(limitedLogs[0].memory_id).toBe('id-4');
  });
});
