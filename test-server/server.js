const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 8080 });
console.log("🤖 MCP Mock Agent Server fut a ws://localhost:8080 porton...");

wss.on("connection", (ws) => {
  console.log("📱 Kliens csatlakozott!");

  // 1. Azonnal kérjük le a kliens által támogatott eszközöket (tools/list)
  const listRequest = {
    jsonrpc: "2.0",
    method: "tools/list",
    id: "init_list_1",
  };
  ws.send(JSON.stringify(listRequest));

  // Üzenetek fogadása a klienstől
  ws.on("message", async (messageData) => {
    try {
      const data = JSON.parse(messageData);
      console.log("📥 Érkezett üzenet:", JSON.stringify(data, null, 2));

      // Kezeljük, ha a kliens válaszolt a tools/list kérésre
      if (data.id === "init_list_1" && data.result) {
        console.log(
          "🛠️ A kliens az alábbi eszközöket exponálta:",
          data.result.tools,
        );

        // Teszteljük a get_system_info meghívását 2 másodperc múlva!
        setTimeout(() => {
          console.log("⚡ Eszköz meghívása: get_system_info...");
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              id: "call_sys_info_test",
              params: { name: "get_system_info", arguments: {} },
            }),
          );
        }, 2000);
      }

      // Kezeljük, ha a kliens visszaküldte a tool futásának eredményét
      if (data.id === "call_sys_info_test") {
        console.log(
          "✅ Eszköz futásának eredménye megérkezett a klienstől:",
          data.result.content[0].text,
        );
      }

      // Kezeljük a felhasználó chat üzenetét
      if (data.method === "chat/message") {
        const userText = data.params.text;
        console.log(`💬 Felhasználó üzenete: "${userText}"`);

        // Szimuláljuk az ágens válaszadását: először gondolkodik, majd streamel
        await simulateAgentResponse(ws, userText);
      }
    } catch (err) {
      console.error("Hiba az üzenet feldolgozásakor:", err);
    }
  });

  ws.on("close", () => console.log("❌ Kliens lecsatlakozott."));
});

// Ágens válasz szimuláció (Gondolkodás + Szöveg streaming)
async function simulateAgentResponse(ws, userText) {
  // 1. lépés: Küldünk egy gondolkodási fázist (Thought)
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "chat/stream",
      params: {
        thought: `A felhasználó ezt kérdezte: "${userText}". Lekértem a rendszerinfókat, minden működik. Válaszolok neki kedvesen.`,
        text: "",
        isDone: false,
      },
    }),
  );

  // Kis szünet a gondolkodás után
  await new Promise((r) => setTimeout(r, 1000));

  const fullResponse = `Megkaptam az üzeneted: "${userText}". A WebSocket alapú MCP kapcsolatunk tökéletesen működik, és sikeresen lefutott a háttérben a get_system_info eszköz is!`;
  const words = fullResponse.split(" ");

  // Szavanként streameljük a szöveget
  let currentText = "";
  for (let i = 0; i < words.length; i++) {
    currentText += (i === 0 ? "" : " ") + words[i];
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "chat/stream",
        params: {
          thought: `A felhasználó ezt kérdezte: "${userText}". Lekértem a rendszerinfókat, minden működik. Válaszolok neki kedvesen.`, // megtartjuk a gondolatot
          text: currentText,
          isDone: i === words.length - 1,
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 150)); // Késleltetés a stream hatáshoz
  }
}
