const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 8080 });
console.log("🤖 MCP Mock Agent Server (Fix Id Check) fut...");

wss.on("connection", (ws) => {
  console.log("📱 Kliens csatlakozott!");

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      id: "list_phase5",
    }),
  );

  ws.on("message", async (messageData) => {
    try {
      const data = JSON.parse(messageData);

      if (data.method === "chat/message") {
        console.log(`📥 Felhasználó üzenete: "${data.params.text}"`);
        await streamComplexResponse(ws);
      }
    } catch (err) {
      console.error("Hiba:", err);
    }
  });

  ws.on("close", () => console.log("❌ Kliens lecsatlakozott."));
});

async function streamComplexResponse(ws) {
  const thought =
    "A felhasználó tesztelni akarja a megjelenítést. Küldök neki formázott szöveget, egy kódblokkot, és a SystemStatusCard widgetet.";

  const fullPayload = `Itt van a kért technikai részlet. Az MCP kliens indításához a következő TypeScript kódot használhatod:

\`\`\`typescript
import { useMcpStore } from './store/mcpStore';

useMcpStore.getState().connect('ws://localhost:8080/mcp');
\`\`\`

A csatlakozás után az ágens az alábbi élő szervermetrikákat küldte vissza neked:

{"type": "ui-widget", "name": "SystemStatusCard", "data": {"cpu": 42, "memory": 78, "status": "optimal", "uptime": "2h 45m"}}`;

  const chunkSize = 20;

  for (let i = 0; i < fullPayload.length; i += chunkSize) {
    const chunk = fullPayload.substring(i, i + chunkSize);
    const isDone = i + chunkSize >= fullPayload.length;

    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null, // JAVÍTÁS: Így már átmegy a transport.ts isJsonRpcMessage ellenőrzésén!
        method: "chat/message",
        params: {
          thought: thought,
          text: chunk,
          done: isDone,
        },
      }),
    );

    await new Promise((r) => setTimeout(r, 40));
  }
}
