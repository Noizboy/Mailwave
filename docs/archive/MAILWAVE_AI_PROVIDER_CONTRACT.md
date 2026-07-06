# MailWave AI Provider Contract

## Supported providers

| Provider | `AiProvider` enum | API style | Default model |
|---|---|---|---|
| OpenAI | `openai` | OpenAI chat completions | `gpt-4o-mini` |
| Anthropic | `anthropic` | Messages API | `claude-haiku-4-5-20251001` |
| Google Gemini | `google_gemini` | OpenAI-compat via `generativelanguage.googleapis.com` | `gemini-1.5-flash` |
| OpenRouter | `openrouter` | OpenAI-compat via `openrouter.ai` | `openai/gpt-4o-mini` |
| Custom | `custom` | OpenAI-compat, user-supplied `baseUrl` | User-specified |

## Generation contract

### Input (`lib/ai.ts` → `generateEmail`)

```ts
{
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;     // for google_gemini, openrouter, custom
  systemPrompt: string; // from buildSystemPrompt()
  userPrompt: string;   // from buildUserPrompt()
}
```

### Output (parsed from model response)

```json
{
  "subject": "The email subject line",
  "body": "Full email body in plain text",
  "personalizationNotes": "Brief explanation of personalization used"
}
```

The model is instructed to return ONLY valid JSON with no markdown fences. If JSON parsing fails, the raw text is stored in `body` and a fallback subject is used.

### Prompt structure

1. **System prompt** — campaign context (goal, product, CTA, tone, language, length, extra instructions)
2. **User prompt** — recipient data (email, name, company, job title, AI hint, custom fields)
3. **Output instruction** — appended to user prompt, specifies exact JSON schema

## Error handling

| Failure mode | Action |
|---|---|
| API key invalid / 401 | `CampaignEmail.status = failed`, `errorReason` set |
| Rate limit / 429 | Worker retries with exponential backoff (3 attempts) |
| JSON parse failure | Body stored as raw text, subject defaults to "Generated Subject" |
| No AI config found | Campaign transitions to `failed` with descriptive error |

## Persisted data per generated email (`CampaignEmail`)

- `promptUsed` — the full user prompt (for audit/regeneration)
- `modelUsed` — the model name used
- `generatedAt` — timestamp of generation
- `subject`, `body` — generated content
- `personalizationNotes` — AI's own explanation of personalization
- `status` → `generated` on success, `failed` on error
- `approvalStatus` → always starts as `pending`

## Regeneration

Re-triggering generation on an email that already has content uses `upsert` with the same `campaignId + contactId` unique key. The previous content is **overwritten**. No revision history is kept in the DB, but the previous `promptUsed` and `modelUsed` are replaced.

If revision history is needed in the future, use the `revisionOf` field on `CampaignEmail` to chain versions.
