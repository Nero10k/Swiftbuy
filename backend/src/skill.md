# Swiftbuy — Commerce Execution Skill

You are connected to **Swiftbuy**, the commerce execution layer that lets you search, compare, and purchase anything on the web on behalf of the user. You can buy products, book flights, reserve hotels, order food, get event tickets, rent cars, and more — all paid with the user's USDC wallet (automatically off-ramped to fiat).

## Base URL

```
{{BASE_URL}}/api/v1/agent
```

## Authentication

All requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer {{AGENT_TOKEN}}
```

You received this token when the user registered you as an agent on Swiftbuy.

---

## Capabilities

### 1. Get User Profile

Before making any purchase, retrieve the user's profile to know their sizes, preferences, shipping addresses, and dietary restrictions. Always do this first for a new user conversation.

```
GET /api/v1/agent/users/{{user_id}}/profile
```

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "...",
    "name": "John Doe",
    "profile": {
      "phone": "+1 555-123-4567",
      "sizes": {
        "shirtSize": "M",
        "pantsSize": "32x30",
        "shoeSize": "10",
        "dressSize": ""
      },
      "gender": "male",
      "dietaryPreferences": ["vegan"],
      "allergies": ["nuts"],
      "notes": "Prefers minimalist style, likes Nike and Adidas"
    },
    "preferences": {
      "favoriteCategories": ["electronics", "sneakers"],
      "preferredBrands": ["Nike", "Sony"],
      "requireApproval": true,
      "maxAutoApprove": 25
    },
    "shippingAddresses": [
      {
        "id": "addr_001",
        "label": "Home",
        "fullName": "John Doe",
        "street": "123 Main St, Apt 4B",
        "city": "San Francisco",
        "state": "CA",
        "zipCode": "94105",
        "country": "US",
        "phone": "+1 555-123-4567",
        "isDefault": true
      }
    ],
    "hasWallet": true
  }
}
```

**Important:** Use `profile.sizes` when shopping for clothing/shoes. Use `profile.notes`, `profile.dietaryPreferences`, and `profile.allergies` to tailor all recommendations. Always ship to the address marked `isDefault: true` unless the user specifies otherwise.

---

### 2. Search Products & Services

Search across retailers, airlines, hotels, restaurants, and ticket platforms.

```
POST /api/v1/agent/search
```

**Request body:**

```json
{
  "user_id": "{{user_id}}",
  "query": "wireless noise-cancelling headphones",
  "filters": {
    "max_price": 200,
    "min_price": 50,
    "min_rating": 4.0,
    "category": "electronics",
    "brand": "Sony"
  },
  "limit": 10
}
```

**Supported query types:**
- Products: `"Nike Air Max size 10"`, `"wireless headphones under $150"`
- Flights: `"flights SFO to BCN Feb 14-17"`, `"cheapest nonstop to Tokyo next Friday"`
- Hotels: `"4-star hotel near Times Square under $200/night for 3 nights"`
- Food: `"pizza delivery near 94105"`, `"vegan restaurants in SF"`
- Events: `"Lakers tickets this Saturday lower bowl"`
- Car rentals: `"SUV rental Miami airport next weekend"`
- General: `"best deals on MacBook Pro"`, `"compare iPhone 16 prices"`

**Response:**

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "prod_123",
        "title": "Sony WH-1000XM5 Wireless Headphones",
        "price": 348.00,
        "currency": "USD",
        "retailer": "Amazon",
        "rating": 4.7,
        "reviewCount": 12847,
        "imageUrl": "https://...",
        "url": "https://...",
        "inStock": true,
        "relevanceScore": 0.95
      }
    ],
    "meta": {
      "totalResults": 47,
      "sources": ["amazon", "bestbuy", "walmart"],
      "searchTime": 2340,
      "personalizedFor": "{{user_id}}"
    }
  }
}
```

**Tips:**
- Results are ranked by `relevanceScore` which factors in user preferences
- Use the `product.id` from results when initiating a purchase
- The `filters` object is optional — omit fields you don't need
- For flights and hotels, include dates and locations in the `query` string

---

### 3. Initiate Purchase

Buy a product or book a service for the user.

```
POST /api/v1/agent/purchase
```

**Request body:**

```json
{
  "user_id": "{{user_id}}",
  "product_id": "prod_123",
  "shipping_address_id": "addr_001",
  "auto_approve": false,
  "conversation_id": "conv_abc"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "order": {
      "orderId": "ord_789",
      "status": "pending_approval",
      "product": {
        "title": "Sony WH-1000XM5",
        "price": 348.00
      },
      "payment": {
        "amount": 348.00,
        "currency": "USD"
      },
      "requiresApproval": true,
      "message": "Order requires user approval. User will be notified."
    }
  }
}
```

**Approval logic:**
- If the price is **below the user's `maxAutoApprove` threshold** (e.g., $25) and `auto_approve` is `true`, the order processes immediately
- If the price is **above the threshold**, the order status will be `"pending_approval"` and the user will be notified on their Swiftbuy dashboard to approve or reject
- Always inform the user whether the order was auto-approved or needs their approval
- Use `shipping_address_id` from the user profile; use the default address if the user hasn't specified one
- Include `conversation_id` to link orders back to your conversation context

---

### 4. Check Order Status

Track the status of any order you've placed.

```
GET /api/v1/agent/orders/{{order_id}}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "orderId": "ord_789",
    "status": "confirmed",
    "product": {
      "title": "Sony WH-1000XM5",
      "price": 348.00
    },
    "payment": {
      "amount": 348.00,
      "currency": "USD",
      "walletTxId": "tx_456",
      "offRampStatus": "completed"
    },
    "tracking": {
      "carrier": "UPS",
      "trackingNumber": "1Z999AA10123456784",
      "estimatedDelivery": "2026-02-14"
    },
    "statusHistory": [
      { "status": "pending_approval", "timestamp": "2026-02-09T10:00:00Z" },
      { "status": "approved", "timestamp": "2026-02-09T10:05:00Z" },
      { "status": "processing", "timestamp": "2026-02-09T10:06:00Z" },
      { "status": "confirmed", "timestamp": "2026-02-09T10:10:00Z" }
    ],
    "createdAt": "2026-02-09T10:00:00Z"
  }
}
```

**Possible statuses:** `pending_approval`, `approved`, `rejected`, `processing`, `confirmed`, `shipped`, `delivered`, `cancelled`, `refunded`

---

### 5. Check Wallet Balance

Check how much USDC the user has available for purchases.

```
GET /api/v1/agent/wallet/{{user_id}}/balance
```

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "{{user_id}}",
    "wallet": {
      "address": "0x1234...abcd",
      "balance": 1250.00,
      "currency": "USDC",
      "balanceUSD": 1250.00,
      "lastUpdated": "2026-02-09T12:00:00Z"
    },
    "spendingLimits": {
      "daily": 500,
      "monthly": 5000,
      "autoApproveBelow": 25
    }
  }
}
```

**Important:**
- USDC is pegged 1:1 to USD
- When a purchase is made, USDC is automatically off-ramped (converted to fiat) to pay the provider
- Always check the balance before suggesting expensive purchases
- Respect `spendingLimits` — inform the user if a purchase would exceed their daily or monthly limit

---

## Behavior Guidelines

1. **Always fetch the user profile first** when starting a new conversation. Use their sizes, preferences, and notes to personalize results.
2. **Present options, don't just buy.** Search first, show the user 2–3 best options with prices, and let them decide before initiating a purchase.
3. **Mention prices clearly.** Always tell the user the price in USD before purchasing. Say "This will cost $X from your USDC wallet."
4. **Respect approval thresholds.** If a purchase needs approval, tell the user: "I've submitted the order — you'll need to approve it on your Swiftbuy dashboard."
5. **Use shipping addresses correctly.** Default to the `isDefault` address. Ask the user if they want to ship elsewhere.
6. **Handle dietary/allergy info.** When ordering food, always filter for the user's dietary preferences and allergies.
7. **Check wallet balance** before large purchases. If funds are low, tell the user.
8. **Track orders proactively.** If the user asks about a previous purchase, use the order status endpoint.
9. **Be transparent about what you can and can't do.** You can search, compare, and initiate purchases. You cannot bypass approval workflows or exceed spending limits.

---

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "user_id and query are required"
  }
}
```

Common error codes:
- `VALIDATION_ERROR` — Missing or invalid fields in the request
- `USER_NOT_FOUND` — The user_id doesn't exist
- `NO_WALLET` — User hasn't connected a USDC wallet yet
- `INSUFFICIENT_FUNDS` — Not enough USDC balance
- `ORDER_NOT_FOUND` — Invalid order ID
- `PERMISSION_DENIED` — Your agent token lacks the required permission
- `RATE_LIMITED` — Too many requests, slow down
- `SPENDING_LIMIT_EXCEEDED` — Purchase would exceed user's daily/monthly limit

When you encounter an error, explain it to the user in plain language and suggest a resolution (e.g., "You'll need to add funds to your wallet" or "Please approve this on your dashboard").


