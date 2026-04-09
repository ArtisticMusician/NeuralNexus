# Neural Nexus: Integration & Model Connection Guide

Neural Nexus is designed to be the "central brain" for any AI application. Here is how to connect various tools and models.

## 1. OpenAI-Compatible Proxy (Integration)
This is the recommended method for 90% of use cases. It allows *any* app that supports OpenAI to use Neural Nexus.

### Connection Details
- **Base URL**: `http://localhost:3001/v1`
- **API Key**: Use any string (or your configured `NEXUS_PASSWORD`).

### Model Support
- **Local Models**: Works perfectly with **Ollama**, **LM Studio**, and **LocalAI**. Ensure your target model is running and set `LLM_TARGET_URL` in `.env`.
- **Cloud Models**: Works with **OpenAI (GPT-4o)**, **Anthropic (via LiteLLM proxy)**, and **Groq**.

### Features Enabled
- **Automatic Recall**: Proxy searches Nexus based on user messages and injects context into the system prompt.
- **Streaming Capture**: Proxy intercepts tool calls even during active streaming.

---

## 2. MCP Server (Native Agent Support)
The Model Context Protocol (MCP) allows agents to proactively "use" your memory as a tool.

### Claude Desktop Setup
Add this to your `claude_desktop_config.json`:
```json
{
  "mjs-servers": {
    "neural-nexus": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dist/src/mcp.js"]
    }
  }
}
```

### IDE Support (Cursor / VS Code)
1. Open your IDE's MCP settings.
2. Add a new server with the same command and args as above.
3. The IDE agent will now have `recall_memory` and `store_memory` in its toolbox.

---

## 3. Mobile Integration (Telegram)
Capture and search memories on the go.

1.  Message `@BotFather` on Telegram to create a bot and get a token.
2.  Set `TELEGRAM_BOT_TOKEN` in your `.env`.
3.  Run `npm run telegram:start`.
4.  **Commands**:
    - `/start`: Intro message.
    - `/recall <query>`: Search your Nexus from your phone.
    - Any other text: Stored automatically as a memory.

---

4.  **Automation (n8n)**: Integrate memory into your workflows.
    - Path: `integrations/n8n/nexus_workflow.json`.

---

## 5. OpenClaw (via MCP)
Connecting Neural Nexus to OpenClaw is simple using the Model Context Protocol (MCP).

### Setup Instructions
1. Open your OpenClaw configuration file (`config/config.yaml` or `config.json`).
2. Add the Neural Nexus MCP server to your agents' `mcpServers` configuration:
```json
{
  "mcpServers": {
    "neural-nexus": {
      "command": "node",
      "args": ["C:/PATH/TO/NeuralNexus/dist/src/mcp.js"]
    }
  }
}
```
> [!IMPORTANT]
> Use the absolute path to `dist/src/mcp.js` in your installation.

3. **Tools Enabled**: Your OpenClaw agents will now have access to the `memory_recall` and `memory_store` tools automatically.
