# Neural Nexus: Step-by-Step Connection Guides

Follow these exact steps to connect your AI agents to your long-term memory.

---

## 1. Method: OpenAI-Compatible Proxy
Use this to add memory to *any* application that supports custom OpenAI endpoints (e.g., Chatbox, SillyTavern, or custom Python scripts).

1.  **Start the Neural Nexus Server**: `npm run server:dev`
2.  **Start the Proxy**: `npm run proxy:start` (Default port: 3001).
3.  **Open your AI App's settings**.
4.  **Change the "API Base URL"** to: `http://localhost:3001/v1`
5.  **Enter any API Key** (if the app requires one).
6.  **Start Chatting**: Your Nexus will now inject relevant memories into every prompt and save new ones automatically.

---

## 2. Agentic Method: MCP Server
Use this for native tool support in Claude Desktop or AI-powered editors like Cursor.

1.  **Build the project**: `npm run build`
2.  **Open your `claude_desktop_config.json`** (usually in `%APPDATA%/Claude` or `~/Library/Application Support/Claude`).
3.  **Add the server**:
    ```json
    {
      "mjs-servers": {
        "neural-nexus": {
          "command": "node",
          "args": ["/ABSOLUTE/PATH/TO/NeuralNexus_universal/dist/src/mcp.js"]
        }
      }
    }
    ```
4.  **Restart Claude**: Look for the 🔨 icon. You can now tell Claude: *"Search my memory for my favorite project"* or *"Remember that I prefer dark mode."*

---

## 3. Mobile Method: Telegram Bot
Use this to capture and search your memories from your phone.

1.  **Get a Token**: Message `@BotFather` on Telegram and create a new bot.
2.  **Add to Config**: Set `TELEGRAM_BOT_TOKEN=your_token` in your `.env`.
3.  **Start the Bot**: `npm run telegram:start`
4.  **Open Telegram**: Find your bot and send it a message.
5.  **Commands**:
    - Just send text to **save** it as a memory.
    - Type `/recall <query>` to **search** your brain on the go.

---

## 4. Administrative Method: CLI Manager
Use this for bulk management, imports, and exports.

1.  **Link the command**: `npm link` (Run once).
2.  **Store a Fact**: `nexus store "The project deadline is Friday" --category fact`
3.  **Search**: `nexus recall "When is the deadline?"`
4.  **Export Everything**: `nexus export backup.jsonl`
5.  **Import from File**: `nexus import backup.jsonl`

---

## 5. Visual Method: Web Dashboard
Use this to browse and search your memories in a clean UI.

1.  **Start the Server**: `npm run server:dev`
2.  **Open Browser**: Go to `http://localhost:3000`
3.  **Search**: Use the search bar to find memories.
4.  **Add**: Click the "+" button to manually type in a new memory.
