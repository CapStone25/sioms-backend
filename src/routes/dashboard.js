const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth } = require('../middleware/auth');

router.get('/stats', auth, (req, res) => {
  const db = getDb();
  const totalEmployees = db.prepare('SELECT COUNT(*) as cnt FROM employees').get().cnt;
  const activeEmployees = db.prepare("SELECT COUNT(*) as cnt FROM employees WHERE status='Active'").get().cnt;
  const present = db.prepare("SELECT COUNT(*) as cnt FROM attendance WHERE date='2025-01-15' AND status='Present'").get().cnt;
  const absent  = db.prepare("SELECT COUNT(*) as cnt FROM attendance WHERE date='2025-01-15' AND status='Absent'").get().cnt;
  const lowStock = db.prepare('SELECT COUNT(*) as cnt FROM inventory WHERE quantity <= min_stock').get().cnt;
  const { monthly } = db.prepare('SELECT SUM(net_salary) as monthly FROM payroll').get();
  const pendingPayroll = db.prepare("SELECT COUNT(*) as cnt FROM payroll WHERE status='Pending'").get().cnt;
  const { canteenRevenue } = db.prepare('SELECT SUM(price * sales) as canteenRevenue FROM canteen_products').get();
  const equipmentActive = db.prepare("SELECT COUNT(*) as cnt FROM equipment WHERE status='Active'").get().cnt;
  const equipmentTotal  = db.prepare('SELECT COUNT(*) as cnt FROM equipment').get().cnt;
  const assetsInUse = db.prepare("SELECT COUNT(*) as cnt FROM assets WHERE status='In Use'").get().cnt;
  const assetsTotal = db.prepare('SELECT COUNT(*) as cnt FROM assets').get().cnt;

  res.json({
    employees:  { total: totalEmployees, active: activeEmployees, onLeave: totalEmployees - activeEmployees },
    attendance: { rate: Math.round((present / Math.max(present+absent,1)) * 100), present, absent },
    inventory:  { total: db.prepare('SELECT COUNT(*) as cnt FROM inventory').get().cnt, lowStock },
    payroll:    { monthly: Math.round(monthly||0), pending: pendingPayroll },
    canteen:    { revenue: Math.round(canteenRevenue||0) },
    workshop:   { active: equipmentActive, total: equipmentTotal },
    assets:     { inUse: assetsInUse, total: assetsTotal },
  });
});

router.get('/revenue-chart', auth, (req, res) => {
  res.json([
    { month:'Jul', canteen:42000, inventory:85000, services:31000 },
    { month:'Aug', canteen:38000, inventory:92000, services:28000 },
    { month:'Sep', canteen:51000, inventory:78000, services:45000 },
    { month:'Oct', canteen:47000, inventory:105000, services:39000 },
    { month:'Nov', canteen:55000, inventory:98000, services:52000 },
    { month:'Dec', canteen:61000, inventory:115000, services:48000 },
    { month:'Jan', canteen:58000, inventory:122000, services:55000 },
  ]);
});

router.get('/attendance-chart', auth, (req, res) => {
  res.json([
    { day:'Mon', present:182, absent:12, late:8 },
    { day:'Tue', present:188, absent:8,  late:6 },
    { day:'Wed', present:175, absent:15, late:12 },
    { day:'Thu', present:191, absent:5,  late:6 },
    { day:'Fri', present:165, absent:20, late:17 },
  ]);
});

router.get('/recent-activity', auth, (req, res) => {
  const db = getDb();
  const activities = [];
  // Last check-ins
  db.prepare("SELECT * FROM attendance WHERE check_in IS NOT NULL ORDER BY date DESC, id DESC LIMIT 3").all()
    .forEach(a => activities.push({ type:'attendance', message: `${a.employee_name} checked in at ${a.check_in}`, time: a.date }));
  // Low stock
  db.prepare("SELECT * FROM inventory WHERE quantity <= min_stock ORDER BY quantity ASC LIMIT 2").all()
    .forEach(i => activities.push({ type:'inventory', message: `Low stock alert: ${i.name} (${i.quantity} ${i.unit})`, time: i.last_updated }));
  // Recent payroll
  activities.push({ type:'payroll', message:'January payroll processed for all employees', time:'2025-01-15' });
  res.json(activities.slice(0, 7));
});

module.exports = router;
