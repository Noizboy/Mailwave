/** Returns true if the key matches the PUBLIC_LOGS_API_KEY env var. */
export function validateApiKey(raw: string): boolean {
  const envKey = process.env.PUBLIC_LOGS_API_KEY?.trim();
  return !!envKey && raw.trim() === envKey;
}
