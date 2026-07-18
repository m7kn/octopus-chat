const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 8080 });
console.log("🤖 MCP Mock Agent Server fut a ws://localhost:8080 porton...");

wss.on("connection", (ws) => {
  console.log("📱 Kliens csatlakozott!");

  // 1. Lekérjük a kliens által regisztrált eszközöket (tools/list)
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      id: "check_tools_phase4",
    }),
  );

  ws.on("message", async (messageData) => {
    try {
      const data = JSON.parse(messageData);
      console.log("📥 Érkezett:", JSON.stringify(data, null, 2));

      // Amikor a kliens válaszol a tools/list-re
      if (data.id === "check_tools_phase4" && data.result) {
        console.log(
          "🛠️ Elérhető eszközök a kliensen:",
          data.result.tools.map((t) => t.name),
        );

        // Teszt 1: Hívjuk meg a list_sandbox_files eszközt 2 másodperc múlva
        setTimeout(() => {
          console.log(
            "⚡ Biztonságos eszközhívás indítása: list_sandbox_files...",
          );
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              id: "call_list_files_test",
              params: { name: "list_sandbox_files", arguments: {} },
            }),
          );
        }, 2000);
      }

      // Amikor megérkezik a list_sandbox_files eredménye
      if (data.id === "call_list_files_test") {
        if (data.error) {
          console.log(
            "❌ Elutasítva vagy Hiba (list_sandbox_files):",
            data.error.message,
          );
        } else {
          console.log(
            "✅ Sikeres fájllistázás! Eredmény:",
            data.result.content[0].text,
          );
        }

        // Teszt 2: Próbáljunk meg beolvasni egy konkrét fájlt (HITL teszt)
        setTimeout(() => {
          console.log(
            "⚡ Kritikus eszközhívás indítása: read_sandbox_file (Keresett: secret_log.txt)...",
          );
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              id: "call_read_file_test",
              params: {
                name: "read_sandbox_file",
                arguments: { fileName: "secret_log.txt" },
              },
            }),
          );
        }, 2000);
      }

      // Amikor megérkezik a read_sandbox_file eredménye
      if (data.id === "call_read_file_test") {
        if (data.error) {
          console.log(
            "❌ Elutasítva vagy Hiba (read_sandbox_file):",
            data.error.message,
          );
        } else {
          console.log(
            "✅ Sikeres fájlolvasás! Tartalom:",
            data.result.content[0].text,
          );
        }
      }
    } catch (err) {
      console.error("Hiba az üzenet parszolásakor:", err);
    }
  });

  ws.on("close", () => console.log("❌ Kliens lecsatlakozott."));
});
