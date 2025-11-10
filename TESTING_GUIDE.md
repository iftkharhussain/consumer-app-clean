# Testing Guide

## Setup for Testing

1. **Install dependencies:**
```bash
npm install
```

2. **Setup environment:**
```bash
cp .env.example .env
```

3. **Update .env with your credentials:**
- MongoDB connection string
- Fortus API credentials
- Other configuration

4. **Start the server:**
```bash
npm run dev
```

---

## Testing with cURL

### 1. Health Check
```bash
curl http://localhost:3025/api/health
```

### 2. Test Paperform Webhook
```bash
curl -X POST http://localhost:3025/api/paperform/webhook \
  -H "Content-Type: application/json" \
  -d @examples/paperform-webhook-example.json
```

### 3. Get Quote Result
```bash
# Replace {quoteId} with actual quote ID from webhook response
curl http://localhost:3025/api/quotes/{quoteId}/result
```

### 4. Get Lead
```bash
# Replace {leadId} with actual lead ID
curl http://localhost:3025/api/leads/{leadId}
```

---

## Testing with Postman

### Import Collection

1. Create a new Postman collection
2. Add requests for each endpoint (see API_DOCUMENTATION.md)
3. Set base URL variable: `{{base_url}}` = `http://localhost:3025/api`

### Example Requests

#### Paperform Webhook
- **Method:** POST
- **URL:** `{{base_url}}/paperform/webhook`
- **Body:** Raw JSON (use example from examples/paperform-webhook-example.json)

#### Get Quote Result
- **Method:** GET
- **URL:** `{{base_url}}/quotes/:quoteId/result`
- **Params:** quoteId = [quote ID from previous response]

---

## Testing Fortus Integration

### Important Notes:
1. **VICC Codes:** Must be valid VICC codes from Fortus documentation
2. **Province Codes:** ON, AB, BC, etc. (must be supported by Fortus)
3. **Date Formats:** Use YYYYMMDD format (e.g., 20251110)
4. **Carrier Codes:** Use actual carrier codes provided by Fortus

### Test Data Requirements:
- Valid postal code for the province
- Birth date making driver at least 16 years old
- License date after birth date
- Vehicle year between 1980 and current year + 1

---

## Testing the Complete Flow

### Step 1: Send Paperform Submission
```bash
curl -X POST http://localhost:3025/api/paperform/webhook \
  -H "Content-Type: application/json" \
  -d @examples/paperform-webhook-example.json
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "lead": {
      "id": "...",
      "email": "john.doe@example.com",
      "status": "quoted"
    },
    "quote": {
      "id": "...",
      "status": "success",
      "trackingNumber": "..."
    }
  }
}
```

### Step 2: View Quote Results
Use the quote ID from Step 1:
```bash
curl http://localhost:3025/api/quotes/{quoteId}/result
```

### Step 3: Check Lead Details
Use the lead ID from Step 1:
```bash
curl http://localhost:3025/api/leads/{leadId}
```

---

## Common Issues and Troubleshooting

### Issue: MongoDB Connection Error
**Solution:** Check your MongoDB URI in .env file and ensure MongoDB is running

### Issue: Fortus API Authentication Error
**Solution:** Verify your Fortus credentials (username and base64 encoded password)

### Issue: Invalid VICC Code
**Solution:** Use valid VICC codes from Fortus postal/ppvicc directory or documentation

### Issue: Quote Generation Fails
**Solution:** 
- Check Fortus API logs in console
- Verify all required fields are present
- Ensure date formats are correct (YYYYMMDD)
- Check province is supported

### Issue: No Carriers Returned
**Solution:**
- Verify carrier codes are valid
- Check if carriers support the province
- Review Fortus documentation for carrier availability

---

## Monitoring Logs

The application logs important events. Monitor them while testing:

```bash
npm run dev
```

Look for:
- `[INFO] Incoming POST /api/paperform/webhook`
- `[INFO] Creating lead from Paperform submission`
- `[INFO] Requesting Fortus quote`
- `[INFO] Fortus quote received successfully`
- `[INFO] Quote created successfully`

Any errors will be logged with `[ERROR]` prefix.

---

## Database Inspection

### Using MongoDB Compass or CLI:

**View Leads:**
```javascript
db.leads.find().pretty()
```

**View Quotes:**
```javascript
db.quotes.find().pretty()
```

**View Latest Quote:**
```javascript
db.quotes.find().sort({createdAt: -1}).limit(1).pretty()
```

---

## Next Steps After Testing

1. ✅ Verify Paperform webhook receives data correctly
2. ✅ Confirm Fortus API integration works
3. ✅ Check quote results are formatted properly
4. ✅ Test error scenarios (missing data, invalid VICC, etc.)
5. ✅ Review logs for any warnings or errors
6. 🚀 Deploy to staging environment
7. 🚀 Connect actual Paperform form
8. 🚀 Test with real user scenarios
