# OrderService

A REST microservice for managing users and orders.

## Getting Started

This service **runs on port 3000**.

Authentication is handled via **HMAC-SHA256 webhook signatures** and **Bearer JWT** for user routes.

### Environment Variables

| Variable       | Description                       |
|----------------|-----------------------------------|
| `JWT_SECRET`   | JWT signing key (required)        |
| `DATABASE_URL` | PostgreSQL connection string      |
| `SMTP_HOST`    | Email relay host (notifications)  |

### Routes

| Method | Path                  | Auth          | Description           |
|--------|-----------------------|---------------|-----------------------|
| GET    | `/api/users`          | Bearer JWT    | List all users        |
| POST   | `/api/users`          | Bearer JWT    | Create user           |
| GET    | `/api/orders`         | Bearer JWT    | List orders           |
| POST   | `/api/orders`         | Bearer JWT    | Create order          |
| POST   | `/api/webhook/github` | HMAC-SHA256   | GitHub event webhook  |

### Setup

```bash
export JWT_SECRET=supersecret
export DATABASE_URL=postgres://localhost/orders
npm install
npm start
```

### Node.js Version

Requires Node.js >= 18.0.0.
