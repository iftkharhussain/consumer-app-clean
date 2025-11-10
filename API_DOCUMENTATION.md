# API Documentation

## Base URL
```
http://localhost:3025/api
```

## Endpoints

### Health Check
Check if the API is running.

**GET** `/health`

**Response:**
```json
{
  "success": true,
  "message": "API is running",
  "timestamp": "2025-11-10T12:00:00.000Z"
}
```

---

### Paperform Webhook

#### Receive Paperform Submission
Webhook endpoint to receive Paperform form submissions.

**POST** `/paperform/webhook`

**Headers:**
```
Content-Type: application/json
```

**Request Body:** (Example)
```json
{
  "submission_id": "abc123",
  "data": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "416-555-0123",
    "date_of_birth": "1990-01-15",
    "gender": "M",
    "marital_status": "S",
    "address": "123 Main St",
    "city": "Toronto",
    "province": "ON",
    "postal_code": "M5V 3A8",
    "license_date": "2008-06-01",
    "license_class": "G",
    "vehicle_year": 2020,
    "vehicle_make": "Honda",
    "vehicle_model": "Civic",
    "vicc_code": "8889"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "lead": {
      "id": "507f1f77bcf86cd799439011",
      "email": "john.doe@example.com",
      "status": "quoted"
    },
    "quote": {
      "id": "507f1f77bcf86cd799439012",
      "status": "success",
      "trackingNumber": "10230052"
    }
  }
}
```

---

### Quotes

#### Get Quote by ID
Retrieve a specific quote.

**GET** `/quotes/:quoteId`

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "quote": {
      "_id": "507f1f77bcf86cd799439012",
      "quoteGuid": "D726BAB974B747FBA24E321B0B9737F2",
      "status": "success",
      "trackingNumber": "10230052",
      "carriers": [
        {
          "name": "DEMA",
          "available": true,
          "premium": 1250.50,
          "coverages": [...]
        }
      ],
      "createdAt": "2025-11-10T12:00:00.000Z"
    }
  }
}
```

#### Get Quote Result
Get formatted quote result for display.

**GET** `/quotes/:quoteId/result`

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "quoteId": "507f1f77bcf86cd799439012",
    "status": "success",
    "trackingNumber": "10230052",
    "lead": {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phone": "416-555-0123"
    },
    "carriers": [...],
    "bestQuote": {
      "name": "DEMA",
      "premium": 1250.50
    }
  }
}
```

#### Create Quote
Manually create a quote for a lead.

**POST** `/quotes`

**Request Body:**
```json
{
  "leadId": "507f1f77bcf86cd799439011",
  "options": {
    "carriers": ["DEMA", "DEMB"],
    "effectiveDate": "20251110"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Quote created successfully",
  "data": {
    "quote": {...},
    "carriers": [...]
  }
}
```

---

### Leads

#### Get Lead by ID
Retrieve a specific lead.

**GET** `/leads/:leadId`

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "lead": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "status": "quoted",
      "quotes": [...]
    }
  }
}
```

#### Update Lead Status
Update the status of a lead.

**PATCH** `/leads/:leadId/status`

**Request Body:**
```json
{
  "status": "contacted"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "lead": {...}
  }
}
```

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "message": "Error message here",
  "errors": ["Additional error details"]
}
```

**Common Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

---

## Lead Status Values
- `new` - Lead just created
- `quoted` - Quote generated
- `contacted` - Lead has been contacted
- `converted` - Lead converted to customer
- `closed` - Lead closed (no conversion)

## Quote Status Values
- `pending` - Quote not yet processed
- `processing` - Quote being generated
- `success` - Quote generated successfully
- `error` - Error generating quote
