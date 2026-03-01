# SIOMS - School Integrated Operations Management System

## Project Structure

```
sioms-project/
├── sioms-backend/      ← Express.js REST API
└── sioms-frontend/     ← Next.js Frontend
```

---

## 🚀 Quick Start

### 1. Start the Backend

```bash
cd sioms-backend
npm install
npm run dev
```

Backend runs at: **http://localhost:5000**

### 2. Start the Frontend

```bash
cd sioms-frontend
npm install
npm run dev
```

Frontend runs at: **http://localhost:3000**

---

## 🔑 Login Credentials

Use any email + password `admin123` and select your role:

| Role | Access |
|------|--------|
| Admin | Everything |
| HR Manager | HR, Attendance, Payroll, Assets |
| Accountant | Payroll, Canteen, Suppliers |
| Workshop Manager | Workshop, Assets, Inventory |
| Inventory Manager | Inventory, Suppliers |
| Teacher | Attendance, Workshop |
| Staff | Attendance only |

---

## 📡 API Endpoints

Base URL: `http://localhost:5000/api`

### Auth
```
POST   /auth/login          → Login, returns JWT token
GET    /auth/me             → Get current user
POST   /auth/logout         → Logout
```

### Dashboard
```
GET    /dashboard/stats           → KPIs summary
GET    /dashboard/revenue-chart   → Revenue chart data
GET    /dashboard/attendance-chart→ Attendance chart data
GET    /dashboard/recent-activity → Recent activity feed
```

### Employees (HR)
```
GET    /employees                  → List (supports ?search=&department=&page=&limit=)
GET    /employees/stats/summary    → Stats
GET    /employees/:id              → Get one
POST   /employees                  → Create
PUT    /employees/:id              → Update
DELETE /employees/:id              → Delete
```

### Attendance
```
GET    /attendance                 → List (supports ?date=&employeeId=&status=)
GET    /attendance/summary         → Today's summary
GET    /attendance/chart           → Chart data
POST   /attendance/check-in        → Check in { employeeId }
POST   /attendance/check-out/:id   → Check out
PUT    /attendance/:id             → Update record
```

### Payroll
```
GET    /payroll                    → List (supports ?month=&department=&status=)
GET    /payroll/summary            → Stats
GET    /payroll/:employeeId        → Get one
PUT    /payroll/:employeeId        → Update
POST   /payroll/:employeeId/pay    → Mark as paid
POST   /payroll/bulk/pay-all       → Pay all pending
```

### Inventory
```
GET    /inventory                  → List (supports ?category=&search=&lowStock=true)
GET    /inventory/summary          → Stats
GET    /inventory/:id              → Get one
POST   /inventory                  → Create
PUT    /inventory/:id              → Update
PATCH  /inventory/:id/quantity     → Update quantity { quantity, operation: 'add'|'subtract'|'set' }
DELETE /inventory/:id              → Delete
```

### Suppliers
```
GET    /suppliers                  → List (supports ?category=&status=&search=)
GET    /suppliers/summary          → Stats
GET    /suppliers/:id              → Get one
POST   /suppliers                  → Create
PUT    /suppliers/:id              → Update
DELETE /suppliers/:id              → Delete
```

### Canteen
```
GET    /canteen/products           → List products
GET    /canteen/products/summary   → Stats
GET    /canteen/products/:id       → Get one
POST   /canteen/products           → Create
PUT    /canteen/products/:id       → Update
DELETE /canteen/products/:id       → Delete
POST   /canteen/checkout           → Process sale { items: [{id, qty}] }
GET    /canteen/transactions       → Transaction history
```

### Workshop
```
GET    /workshop/equipment         → List (supports ?status=&department=)
GET    /workshop/equipment/summary → Stats
GET    /workshop/equipment/:id     → Get one
POST   /workshop/equipment         → Create
PUT    /workshop/equipment/:id     → Update
POST   /workshop/equipment/:id/maintenance → Log maintenance
DELETE /workshop/equipment/:id     → Delete
GET    /workshop/maintenance-logs  → All maintenance logs
```

### Assets
```
GET    /assets                     → List (supports ?status=&employeeId=&search=)
GET    /assets/summary             → Stats
GET    /assets/:id                 → Get one
POST   /assets                     → Create
PUT    /assets/:id                 → Update
POST   /assets/:id/return          → Return asset
DELETE /assets/:id                 → Delete
```

---

## 🛠️ Environment Variables

### Backend (.env)
```env
PORT=5000
JWT_SECRET=sioms_super_secret_jwt_key_2025
JWT_EXPIRES_IN=24h
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 🗄️ Database

Currently uses **in-memory storage** (data resets on server restart).

To use a real database, replace `src/data/db.js` with your database connection (PostgreSQL with Prisma, MongoDB with Mongoose, etc.)

---

## 🔒 Security

- JWT authentication on all protected routes
- Role-based access control (RBAC) per module
- CORS configured for frontend URL
- Helmet.js for HTTP security headers
