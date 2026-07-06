# MailWave Manual Testing Instructions

## Quick Start

### Credentials
- **Email:** demo@mailwave.app
- **Password:** password123
- **URL:** http://localhost:3000

### Test Campaign
- **Campaign Name:** Wisebill
- **Campaign ID:** cmr2zyn610000hsueg7avx0c5
- **Status:** draft
- **List:** Tech Leaders Q1 (12 members)
- **AI Provider:** OpenRouter (connected)

---

## MW-GEN-003: Test "Generate Emails" Button

1. Open http://localhost:3000 in your browser
2. Login with demo@mailwave.app / password123
3. Navigate to Campaigns → Find "Wisebill" campaign
4. Click "Generate Emails" button
5. Observe:
   - Status should show "Generating..." (spinning icon)
   - Terminal with worker should show: "Generate job cmr2zyn610000hsueg7avx0c5 progress: ..."
   - After 30-60 seconds, status should change to "pending_review"
   - Generated emails should appear in "Generated Emails" table

### Expected Behavior
- Email generation takes ~2-3 seconds per contact
- Progress updates every 5 contacts
- Final status: "pending_review"
- Emails table shows 12 emails (one per contact)

### If It Fails
- Check worker logs (terminal running `npm run worker`)
- Check browser DevTools Console (F12) for API errors
- See MW-GEN-004 for debugging timeout issues
- See MW-GEN-005 for API error details

---

## MW-GEN-004: Monitor Worker Logs

Keep the terminal with `npm run worker` visible. Look for:

```
Generate job cmr2zyn610000hsueg7avx0c5 progress: 25%
Generate job cmr2zyn610000hsueg7avx0c5 progress: 50%
Generate job cmr2zyn610000hsueg7avx0c5 progress: 75%
Generate job cmr2zyn610000hsueg7avx0c5 progress: 100%
Generate job cmr2zyn610000hsueg7avx0c5 completed
```

### Common Errors

**Error: "No connected AI config found"**
- AI configuration is not connected
- Solution: Go to Settings → AI → Connect provider

**Error: "No eligible contacts found"**
- List has no subscribed contacts (all unsubscribed/bounced)
- Solution: Check that contacts have status="subscribed"

**Error: "Campaign not found"**
- Campaign ID is incorrect or deleted
- Solution: Verify campaign exists in UI

---

## MW-GEN-005: Check API Response

1. Open browser DevTools: F12 → Network tab
2. Click "Generate Emails" button
3. Look for POST request to `/api/campaigns/cmr2zyn610000hsueg7avx0c5/generate`
4. Check Response tab:
   ```json
   {
     "jobId": "generate-cmr2zyn610000hsueg7avx0c5",
     "status": "queued"
   }
   ```
5. HTTP Status should be 200

### If Status is 4xx/5xx
- 401: Not authenticated (login required)
- 404: Campaign not found
- 400: Bad request (check payload)
- 500: Server error (check server logs)

---

## MW-GEN-006: Verify Status Change

1. After clicking "Generate Emails", wait 1 minute
2. Reload page (F5)
3. Campaign status should show "pending_review" (green badge)
4. "Generate Emails" button should disappear
5. "Review Emails" button should appear
6. Generated emails table should be populated with 12 rows

---

## MW-GEN-007: Review AI Configuration

1. Navigate to Settings (gear icon)
2. Click "AI" tab
3. Verify:
   - Provider: "OpenRouter" (or your configured provider)
   - Status: "Connected" (green indicator)
   - Model: Should be populated (e.g., "openrouter/openai/gpt-3.5-turbo")
4. Click "Test Connection" button
5. Should show: "Connection successful" message

---

## MW-GEN-008: Verify Contacts in List

### Via UI
1. Navigate to Lists
2. Click "Tech Leaders Q1"
3. Should show 12 subscribed contacts

### Via Database
```bash
# Connect to PostgreSQL:
PGPASSWORD=admin psql -U postgres -h localhost -d mailwave

# Count members in the list:
SELECT COUNT(*) FROM "ListMember" WHERE "listId" = 'seed-list-1';
# Should return: 12

# Count subscribed contacts:
SELECT COUNT(*) FROM "Contact" 
WHERE "userId" = 'cmr2pijvm0000bouew0zkabr4' 
AND status = 'subscribed';
# Should return: 30+
```

---

## Summary Checklist

- [ ] **MW-GEN-003**: Generated emails appear in campaign
- [ ] **MW-GEN-004**: Worker logs show progress without errors
- [ ] **MW-GEN-005**: API endpoint returns 200 with jobId
- [ ] **MW-GEN-006**: Campaign status changed to "pending_review"
- [ ] **MW-GEN-007**: AI provider is connected
- [ ] **MW-GEN-008**: List has 12 eligible contacts

---

## Notes

- Generation speed depends on AI provider response time
- OpenRouter is used for this demo (free tier available)
- Worker runs in background; no manual intervention needed
- If generation stalls, restart worker: Stop `npm run worker` and run again
