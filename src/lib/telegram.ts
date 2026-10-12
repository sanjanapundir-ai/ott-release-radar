const TELEGRAM_LIMIT = 4096;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Split on entry boundaries so no HTML tag is cut in half.
function chunk(blocks: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > TELEGRAM_LIMIT) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + block;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendTelegramDigest(blocks: string[]): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Telegram environment variables not set");

  const messages = chunk(blocks);
  for (const text of messages) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
    }
  }
  return messages.length;
}
