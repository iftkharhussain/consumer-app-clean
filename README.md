# Consumer App API - Phase 1

## 🎯 Overview
Phase 1 implementation of the Consumer App API providing a complete question flow to quote result pipeline with Fortus API integration. This application receives form submissions from Paperform, generates auto insurance quotes via the Fortus SOAP API, and stores all data in the existing Lead Management System database.

## 📋 Features
- ✅ **Paperform Integration:** Webhook endpoint to receive form submissions
- ✅ **Fortus API Integration:** SOAP-based auto insurance quote generation
- ✅ **Lead Management:** Store and track leads in MongoDB
- ✅ **Quote Generation:** Automated quote creation from lead data
- ✅ **Quote Results:** Formatted quote results with carrier comparison
- ✅ **Error Handling:** Comprehensive error handling and logging
- ✅ **Modular Architecture:** NestJS-inspired clean structure

## 🛠 Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose ODM
- **API Style:** RESTful
- **Architecture:** Modular (Controllers, Services, Routes, Models)
- **Integrations:** 
  - Paperform (Webhooks)
  - Fortus SOAP API (Auto Insurance Rating)

## 📁 Project Structure
```
consumer-app-api/
├── src/
│   ├── config/
│   │   ├── index.js              # Configuration management
│   │   └── database.js           # MongoDB connection
│   ├── controllers/
│   │   ├── paperformController.js # Paperform webhook handlers
│   │   ├── quoteController.js     # Quote management
│   │   └── leadController.js      # Lead management
│   ├── models/
│   │   ├── Lead.js               # Lead schema
│   │   └── Quote.js              # Quote schema
│   ├── services/
│   │   ├── fortusService.js      # Main Fortus integration
│   │   ├── fortusXmlBuilder.js   # SOAP/XML request builder
│   │   ├── fortusXmlParser.js    # SOAP/XML response parser
│   │   ├── quoteService.js       # Quote business logic
│   │   └── leadService.js        # Lead business logic
│   ├── routes/
│   │   ├── index.js              # Route aggregator
│   │   ├── paperformRoutes.js    # Paperform routes
│   │   ├── quoteRoutes.js        # Quote routes
│   │   └── leadRoutes.js         # Lead routes
│   ├── middlewares/
│   │   ├── errorHandler.js       # Global error handling
│   │   └── requestLogger.js      # Request logging
│   ├── utils/
│   │   ├── logger.js             # Logging utility
│   │   ├── response.js           # Response formatters
│   │   └── dateHelpers.js        # Date utilities
│   └── app.js                    # Application entry point
├── examples/
│   └── paperform-webhook-example.json
├── Fortus documentation/         # Fortus API documentation
├── .env.example                  # Environment template
├── .gitignore
├── package.json
├── README.md
├── API_DOCUMENTATION.md          # Detailed API docs
└── TESTING_GUIDE.md             # Testing instructions
```

## 🚀 Quick Start

### Prerequisites
- Node.js v16 or higher
- MongoDB instance (local or cloud)
- Fortus API credentials

### Installation

1. **Clone and navigate:**
```bash
cd consumer-app-api
```

2. **Install dependencies:**
```bash
npm install
```

3. **Setup environment:**
```bash
cp .env.example .env
```

4. **Configure .env file:**
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/lead-management-system

# Fortus API
FORTUS_API_URL=https://ratingwebservices.compu-quote.com/RatingWebService.asmx
FORTUS_USERNAME=your_username
FORTUS_PASSWORD=your_base64_encoded_password

# Server
PORT=3025
```

5. **Start the server:**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3025`

## 📡 API Endpoints

### Core Endpoints
- `GET /` - API information
- `GET /api/health` - Health check

### Paperform Integration
- `POST /api/paperform/webhook` - Receive form submissions
- `GET /api/paperform/test` - Test webhook endpoint

### Quote Management
- `GET /api/quotes/:quoteId` - Get quote details
- `GET /api/quotes/:quoteId/result` - Get formatted quote results
- `POST /api/quotes` - Create new quote

### Lead Management
- `GET /api/leads/:leadId` - Get lead details
- `PATCH /api/leads/:leadId/status` - Update lead status

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for detailed endpoint documentation.

## 🧪 Testing

### Quick Test
```bash
# Health check
curl http://localhost:3025/api/health

# Test webhook
curl -X POST http://localhost:3025/api/paperform/webhook \
  -H "Content-Type: application/json" \
  -d @examples/paperform-webhook-example.json
```

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive testing instructions.

## 🔄 Workflow

1. **Form Submission:** User fills out Paperform → Webhook triggers
2. **Lead Creation:** System creates lead record in database
3. **Quote Generation:** 
   - Transform lead data to Fortus format
   - Send SOAP request to Fortus API
   - Parse response and extract carrier quotes
4. **Data Storage:** Save quote with carrier results
5. **Result Display:** Format and return quote results

## 📊 Data Flow

```
Paperform → Webhook → Lead Service → Quote Service → Fortus API
                ↓                          ↓              ↓
           MongoDB (Lead)          Quote Processing   SOAP Response
                                           ↓              ↓
                                    MongoDB (Quote) ←─ Parser
                                           ↓
                                    Result API → Frontend
```

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | No |
| `PORT` | Server port | No |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `FORTUS_API_URL` | Fortus SOAP API endpoint | Yes |
| `FORTUS_USERNAME` | Fortus API username | Yes |
| `FORTUS_PASSWORD` | Base64 encoded password | Yes |
| `FORTUS_CALLER_NAME` | Caller identification | No |
| `FORTUS_CALLER_VERSION` | Caller version | No |

## 🔧 Configuration

### Default Coverages (Ontario)
- Third Party Liability (TPBI): $1,000,000
- Third Party Property Damage (TPPD): $1,000,000
- Direct Compensation (TPDC): $0 deductible
- Accident Benefits (AB)
- Uninsured Automobile (UA)
- Collision (COL): $500 deductible
- Comprehensive (CMP): $300 deductible
- Family Protection (44): $1,000,000

### Supported Provinces
Currently configured for:
- Ontario (ON)
- Can be extended to AB, BC, NB, NF, NS, NT, PE, QC, SK, YT

## 📝 Database Schema

### Lead Collection
```javascript
{
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    province: String,
    postalCode: String
  },
  dateOfBirth: Date,
  vehicles: [Object],
  quotes: [ObjectId],
  status: String, // new, quoted, contacted, converted, closed
  // ... more fields
}
```

### Quote Collection
```javascript
{
  quoteGuid: String,
  leadId: ObjectId,
  status: String, // pending, processing, success, error
  trackingNumber: String,
  carriers: [{
    name: String,
    premium: Number,
    available: Boolean,
    coverages: [Object]
  }],
  fortusRequest: Object,
  fortusResponse: Object,
  // ... more fields
}
```

## 🐛 Troubleshooting

### Common Issues

**MongoDB Connection Failed**
- Verify MongoDB is running
- Check connection string in .env
- Ensure network access to MongoDB instance

**Fortus API Errors**
- Verify credentials are correct
- Check if password is base64 encoded
- Ensure VICC codes are valid
- Confirm province is supported

**No Quotes Returned**
- Verify carrier codes are correct
- Check if carriers support the province
- Review Fortus documentation

See logs for detailed error messages.

## 📚 Fortus Integration

The app integrates with Fortus Rating Web Service v6.1 using SOAP/XML protocol:

1. **XML Builder:** Constructs SOAP envelopes and Fortus transaction XML
2. **SOAP Client:** Sends HTTP POST requests to Fortus API
3. **XML Parser:** Parses SOAP responses and extracts quote data
4. **Error Handler:** Handles Fortus-specific errors

Documentation available in `/Fortus documentation` directory.

## 🚧 Phase 2 Roadmap

Future enhancements (not in Phase 1):
- [ ] Authentication & authorization
- [ ] Advisor portal connection
- [ ] Multi-line quotes (Auto + Home)
- [ ] Quote comparison features
- [ ] Email notifications
- [ ] SMS integration
- [ ] Payment processing
- [ ] Policy binding

## 📄 License
ISC

## 👥 Support
For questions or issues, contact the development team.

---

**Version:** 1.0.0  
**Last Updated:** November 2025  
**Status:** Phase 1 Complete ✅
