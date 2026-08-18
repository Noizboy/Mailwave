export type CompletionEstimate = {
  daysNeeded: number;
  emailsPerDay: number;
  estimatedDate: Date;
};

export function estimateCompletion(
  remainingEmails: number,
  intervalType: string,
  minInterval: number,
  maxInterval: number,
  sendWindowStart: number | null,
  sendWindowEnd: number | null,
  dailyLimit: number
): CompletionEstimate | null {
  if (remainingEmails <= 0) return null;

  const avgInterval =
    intervalType === "fixed" ? minInterval : (minInterval + maxInterval) / 2;

  const windowHours =
    sendWindowStart !== null && sendWindowEnd !== null
      ? sendWindowEnd > sendWindowStart
        ? sendWindowEnd - sendWindowStart
        : 24 - sendWindowStart + sendWindowEnd
      : 24;

  const windowMinutes = windowHours * 60;
  const emailsPerDayByInterval = Math.floor(windowMinutes / avgInterval) + 1;
  const effectivePerDay = Math.min(emailsPerDayByInterval, dailyLimit);

  const daysNeeded = Math.ceil(remainingEmails / effectivePerDay);
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + daysNeeded);

  return { daysNeeded, emailsPerDay: effectivePerDay, estimatedDate };
}
