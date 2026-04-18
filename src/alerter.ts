let lastAlertTime = 0;

export async function checkAndAlert(blobFee: number, threshold: number, chatId: string) {
  const now = Date.now();

  // Cooldown: 10 min
  if (blobFee > threshold && now - lastAlertTime > 10 * 60 * 1000) {
    await sendTelegram(chatId, blobFee);
    lastAlertTime = now;
  }
}
async function sendTelegram(chatId: string, fee: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: `⚠️ Blob fee alert: ${fee} gwei exceeded threshold`
    })
  });
}
