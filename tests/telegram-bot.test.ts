import { test, expect, vi, beforeEach, describe } from "vitest";
import { createTelegramBot } from "../src/telegram-bot.js";
import { NeuralNexusCore } from "../src/core/NeuralNexusCore.js";
import { normalizeMemoryConfig } from "../src/core/config.js";
import { InMemoryStorageFake } from "./fakes/InMemoryStorage.js";
import { EmbeddingFake } from "./fakes/EmbeddingFake.js";
import { createMockAuthContext } from './test-utils.js';

// Mock the Audit service to avoid sqlite3 issues
vi.mock('../src/core/ReplacementAuditService.js', () => ({
  ReplacementAuditService: class {
    async initialize() { }
    async logReplacement() { }
    async close() { }
  }
}));

// Mock Telegraf constructor only
const mockBotInstance = {
  start: vi.fn(),
  command: vi.fn(),
  on: vi.fn(),
  launch: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
};

vi.mock("telegraf", () => ({
  Telegraf: vi.fn().mockImplementation(function () { return mockBotInstance; })
}));

describe("Telegram Bot (No Mocks Integration)", () => {
  let core: NeuralNexusCore;

  beforeEach(() => {
    vi.clearAllMocks();
    const config = normalizeMemoryConfig({
        auth: { enabled: false }
    });
    core = new NeuralNexusCore(config);

    // Inject Fakes
    (core as any).storage = new InMemoryStorageFake();
    (core as any).embedding = new EmbeddingFake();

    createTelegramBot(core);
  });

  test("Bot registers recall command and successfully interacts with core", async () => {
    const recallCall = mockBotInstance.command.mock.calls.find((c: any) => c[0] === 'recall');
    const recallHandler = recallCall ? recallCall[1] : undefined;
    if (!recallHandler) throw new Error("Recall handler not registered");

    const mockCtx = {
      message: { text: '/recall my name' },
      from: { id: 999 },
      reply: vi.fn(),
    };

    // 1. Seed the fake storage directly
    const context = createMockAuthContext("telegram:999");
    await core.store({ text: "User name is Josh" }, context);

    // 2. Trigger the bot handler
    await recallHandler(mockCtx);

    // 3. Verify it found the seeded memory
    expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Josh'));
  });

  test("Bot text handler stores new memory in fake database", async () => {
    const textCall = mockBotInstance.on.mock.calls.find((c: any) => c[0] === 'text');
    const textHandler = textCall ? textCall[1] : undefined;
    if (!textHandler) throw new Error("Text handler not registered");

    const mockCtx = {
      message: { text: 'Remember that I like pizza' },
      from: { id: 999 },
      reply: vi.fn(),
    };

    await textHandler(mockCtx);

    // Verify it actually reached the core and storage
    const context = createMockAuthContext("telegram:999");
    const recall = await core.recall({ query: "pizza" }, context);
    expect(recall.memories).toHaveLength(1);
    expect(recall.memories[0].text).toContain("pizza");
    expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Saved'));
  });
});
