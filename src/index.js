require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { getDb } = require('./db/database');

// Auto-seed on first run
const { execSync } = require('child_process');
try {
  const db = getDb();
  const cnt = db.prepare('SELECT COUNT(*) as cnt FROM employees').get().cnt;
  if (cnt === 0) {
    console.log('🌱 First run detected - seeding database...');
    require('./db/seed');
  }
} catch(e) { /* will seed when route is first hit */ }

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/employees',  require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll',    require('./routes/payroll'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/suppliers',  require('./routes/suppliers'));
app.use('/api/canteen',    require('./routes/canteen'));
app.use('/api/workshop',   require('./routes/workshop'));
app.use('/api/assets',     require('./routes/assets'));
app.use('/api/hr',         require('./routes/hr'));
app.use('/api/dashboard',  require('./routes/dashboard'));

app.get('/api/health', (req, res) => res.json({ status:'OK', message:'SIOMS API running', timestamp: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ message: `Route ${req.method} ${req.path} not found.` }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message:'Internal server error.', error: process.env.NODE_ENV==='development' ? err.message : undefined });
});

app.listen(PORT, async () => {
  console.log(`\n🚀 SIOMS Backend → http://localhost:${PORT}`);
  console.log(`📋 Health check → http://localhost:${PORT}/api/health`);
  // Seed if empty
  try {
    const db = getDb();
    const cnt = db.prepare('SELECT COUNT(*) as cnt FROM employees').get().cnt;
    if (cnt === 0) { const seed = require('./db/seed'); await seed(); }
  } catch {}
});

module.exports = app;
