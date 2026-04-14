let lastAlertTime = 0;

export async function checkAndAlert(blobFee: number, threshold: number, chatId: string) {
  const now = Date.now();

  // Cooldown: 10 min
  if (blobFee > threshold && now - lastAlertTime > 10 * 60 * 1000) {
    await sendTelegram(chatId, blobFee);
    lastAlertTime = now;
  }
}
