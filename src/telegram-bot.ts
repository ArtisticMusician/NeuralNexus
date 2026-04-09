import { Telegraf, Markup } from 'telegraf';
import { NeuralNexusCore } from './core/NeuralNexusCore.js';
import { core as defaultCore } from './server.js';
import axios from 'axios';
import 'dotenv/config';

export function createTelegramBot(core: NeuralNexusCore) {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
  const API_URL = process.env.API_URL || 'http://localhost:3000';

  // Per-user pending category state:
  // After tapping "Store as preference", the next plain message is stored under that category.
  const pendingCategory = new Map<number, string>();

  const getCategories = async () => {
    try {
      const res = await axios.get(`${API_URL}/categories`);
      return res.data.categories as string[];
    } catch {
      return ['fact', 'preference', 'entity', 'decision']; // fallback
    }
  };

  /**
   * Helper to get AuthContext for Telegram interactions.
   */
  async function getTelegramAuthContext(fromId: number): Promise<any> {
      const globalToken = process.env.NEXUS_TELEGRAM_TOKEN;
      const authService = core.getAuthService();
      const userid = `telegram:${fromId}`;

      if (globalToken) {
          try {
              return await authService.verifyToken(globalToken, "telegram");
          } catch (err) {
              console.warn(`[Telegram] Global token verification failed: ${err instanceof Error ? err.message : String(err)}`);
          }
      }

      return {
          userId: userid,
          tokenId: "telegram-session",
          scopes: ["memory:read", "memory:write", "memory:update"],
          adapterId: "telegram"
      };
  }

  // Command: /start
  bot.start(async (ctx) => {
    const categories = await getCategories();
    ctx.reply(
      'Welcome to your Neural Nexus Mobile Agent! Send me anything to remember, or use /recall <query> to search.',
      Markup.keyboard([
        ['/recall', '/categories'],
        ...categories.map(c => [`Store as ${c}`]).reduce((acc: any[], curr, i) => {
          if (i % 2 === 0) acc.push([curr[0]]);
          else acc[acc.length - 1].push(curr[0]);
          return acc;
        }, [])
      ]).resize()
    );
  });

  bot.command('categories', async (ctx) => {
    const categories = await getCategories();
    ctx.reply(`Available categories: ${categories.join(', ')}`);
  });

    // Command: /recall <query>
  bot.command('recall', async (ctx) => {
    const query = ctx.message.text.replace('/recall', '').trim();
    if (!query) return ctx.reply('Please provide a query: /recall <query>');

    try {
      const context = await getTelegramAuthContext(ctx.from.id);
      const res = await core.recall({ query, limit: 3 }, context);
      const memories = res.memories;

      if (!memories || memories.length === 0) {
        return ctx.reply('No relevant memories found.');
      }

      const reply = memories.map((m: any) => `📌 [${m.category}] ${m.text}`).join('\n\n');
      ctx.reply(`🧠 Found these relevant memories:\n\n${reply}`);
    } catch (err: any) {
      ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  // Any other message: Store it (with category awareness)
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return; // Ignore other commands

    const context = await getTelegramAuthContext(ctx.from.id);

    // ──────────────────────────────────────────────
    // 1. Check whether the message matches a "Store as <category>" button press,
    //    optionally followed by ": <content>" for single-message storage.
    //    Examples:
    //      "Store as preference"                → sets pending category
    //      "Store as preference: I like coffee"  → stores immediately
    // ──────────────────────────────────────────────
    const storeMatch = text.match(/^Store as (\w+)(?::\s*(.+))?$/is);
    if (storeMatch) {
      const category = storeMatch[1].toLowerCase() as any;
      const inlineContent = storeMatch[2]?.trim();

      if (inlineContent) {
        // "Store as preference: I like coffee" → store right away
        try {
          await core.store({ text: inlineContent, category }, context);
          return ctx.reply(`✅ Saved to long-term memory as "${category}".`);
        } catch (err: any) {
          return ctx.reply(`❌ Failed to store: ${err.message}`);
        }
      }

      // Bare button tap ("Store as preference") → remember category for next message
      pendingCategory.set(ctx.from.id, category);
      return ctx.reply(
        `📁 Category set to "${category}". Now send me the text you'd like to remember.`
      );
    }

    // ──────────────────────────────────────────────
    // 2. If a category was previously selected via button, apply it now.
    // ──────────────────────────────────────────────
    const category = pendingCategory.get(ctx.from.id) as any;
    if (category) {
      pendingCategory.delete(ctx.from.id);
      try {
        await core.store({ text, category }, context);
        return ctx.reply(`✅ Saved to long-term memory as "${category}".`);
      } catch (err: any) {
        return ctx.reply(`❌ Failed to store: ${err.message}`);
      }
    }

    // ──────────────────────────────────────────────
    // 3. Default: no category specified — let the core auto-classify.
    // ──────────────────────────────────────────────
    try {
      await core.store({ text }, context);
      ctx.reply('✅ Saved to long-term memory.');
    } catch (err: any) {
      ctx.reply(`❌ Failed to store: ${err.message}`);
    }
  });

  return bot;
}

export const start = async () => {
  await defaultCore.initialize();
  const bot = createTelegramBot(defaultCore);
  bot.launch();
  console.log('Mobile Agent (Telegram Bot) is active.');

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

// Start if executed directly
if (import.meta.url.endsWith(process.argv[1])) {
  start();
}