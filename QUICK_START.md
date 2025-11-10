# 🚀 Quick Start Guide

## Initial Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
```

### 3. Configure .env
Edit `.env` and add your credentials:
```env
MONGODB_URI=mongodb://localhost:27017/lead-management-system
FORTUS_USERNAME=your_username
FORTUS_PASSWORD=your_base64_password
```

### 4. Start Server
```bash
npm run dev
```

---

## Quick Test (2 minutes)

### Test 1: Health Check
```bash
curl http://localhost:3025/api/health
```

Expected: `{"success":true,"message":"API is running"}`

### Test 2: Test Webhook
```bash
curl -X POST http://localhost:3025/api/paperform/webhook \
  -H "Content-Type: application/json" \
  -d @examples/paperform-webhook-example.json
```

Expected: Lead and Quote created with IDs returned

### Test 3: Get Quote Result
```bash
# Use quote ID from Test 2
curl http://localhost:3025/api/quotes/{QUOTE_ID}/result
```

Expected: Formatted quote with carrier information

---

## Common Commands

### Development
```bash
npm run dev          # Start with auto-reload
npm start            # Start production mode
```

### Testing
```bash
# Health check
curl http://localhost:3025/api/health

# Create lead and quote
curl -X POST http://localhost:3025/api/paperform/webhook \
  -H "Content-Type: application/json" \
  -d @examples/paperform-webhook-example.json

# Get quote
curl http://localhost:3025/api/quotes/{QUOTE_ID}

# Get quote results
curl http://localhost:3025/api/quotes/{QUOTE_ID}/result

# Get lead
curl http://localhost:3025/api/leads/{LEAD_ID}
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/app.js` | Main application entry point |
| `src/controllers/paperformController.js` | Handles Paperform webhooks |
| `src/services/fortusService.js` | Fortus API integration |
| `src/models/Lead.js` | Lead data schema |
| `src/models/Quote.js` | Quote data schema |
| `.env` | Configuration (create from .env.example) |

---

## Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/paperform/webhook` | Paperform webhook |
| GET | `/api/quotes/:id` | Get quote details |
| GET | `/api/quotes/:id/result` | Get formatted quote |
| POST | `/api/quotes` | Create new quote |
| GET | `/api/leads/:id` | Get lead details |

---

## Configuration Checklist

- [ ] MongoDB installed and running
- [ ] `.env` file created from `.env.example`
- [ ] MongoDB URI configured
- [ ] Fortus credentials added (username & password)
- [ ] Dependencies installed (`npm install`)
- [ ] Server starts without errors (`npm run dev`)
- [ ] Health check returns success

---

## Troubleshooting

### Server won't start
- Check if port 3025 is already in use
- Verify MongoDB connection string
- Check all dependencies installed

### Cannot connect to MongoDB
- Ensure MongoDB is running: `mongod` or `brew services start mongodb-community`
- Check connection string in .env
- Verify network access

### Fortus API errors
- Verify credentials are correct
- Check if password is base64 encoded
- Ensure VICC codes are valid (see Fortus documentation)

### No quotes returned
- Check Fortus API credentials
- Verify carrier codes in example data
- Review server logs for detailed errors

---

## What to Modify

### Add New Carriers
Edit `src/services/fortusService.js`:
```javascript
const getDefaultCarriers = () => {
  return ['CARRIER1', 'CARRIER2', 'CARRIER3'];
};
```

### Change Default Coverages
Edit `src/services/fortusService.js`:
```javascript
const getDefaultOntarioCoverages = () => {
  return [
    { id: 'TPBI', csioCode: 'TPBI', limit1: 2000000 },
    // ... add more
  ];
};
```

### Modify Paperform Field Mapping
Edit `src/services/leadService.js`:
```javascript
const transformPaperformData = (paperformData) => {
  const data = paperformData.data || {};
  // Modify field mappings here
};
```

---

## Documentation

📖 **Full Documentation:**
- [README.md](./README.md) - Complete project overview
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API reference
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Testing instructions
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - What was built

📁 **Fortus Documentation:**
- See `Fortus documentation/` directory for complete Fortus API reference

---

## Getting Help

1. Check server logs for errors
2. Review documentation files
3. Check MongoDB connection
4. Verify Fortus credentials
5. Test with example data first

---

## Production Deployment

Before deploying:
1. Set `NODE_ENV=production` in .env
2. Use production MongoDB URI
3. Configure proper Fortus credentials
4. Set up domain/URL for Paperform webhook
5. Configure CORS for your frontend domain
6. Set up monitoring and logging
7. Configure SSL/HTTPS

---

**Need Help?** Check the documentation files or contact the development team.

**Version:** 1.0.0 | **Phase:** 1 Complete ✅
