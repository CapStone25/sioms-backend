const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

const toFront = (e) => e ? ({
  id: e.id, employeeId: e.employee_id, name: e.name, department: e.department,
  position: e.position, salary: e.salary, status: e.status, joinDate: e.join_date,
  phone: e.phone, email: e.email, attendance: e.attendance,
  avatar: e.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${e.id}`,
}) : null;

// ── IMPORTANT: /all and /stats/summary MUST be before /:id ───────────────────

// Get ALL employees for dropdowns (no pagination) - must be before /:id
router.get('/all', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const data = db.prepare("SELECT * FROM employees ORDER BY name ASC").all();
  res.json(data.map(toFront));
});

router.get('/stats/summary', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const total      = db.prepare('SELECT COUNT(*) as cnt FROM employees').get().cnt;
  const active     = db.prepare("SELECT COUNT(*) as cnt FROM employees WHERE status='Active'").get().cnt;
  const onLeave    = db.prepare("SELECT COUNT(*) as cnt FROM employees WHERE status='On Leave'").get().cnt;
  const departments= db.prepare('SELECT COUNT(DISTINCT department) as cnt FROM employees').get().cnt;
  res.json({ total, active, onLeave, departments });
});

router.get('/', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { search = '', department = '', status = '', page = 1, limit = 20 } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (name LIKE ? OR employee_id LIKE ? OR department LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  if (department && department !== 'All') { where += ' AND department = ?'; params.push(department); }
  if (status && status !== 'All') { where += ' AND status = ?'; params.push(status); }

  const total  = db.prepare(`SELECT COUNT(*) as cnt FROM employees ${where}`).get(...params).cnt;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const data   = db.prepare(`SELECT * FROM employees ${where} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  res.json({ data: data.map(toFront), total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/:id', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE id=? OR employee_id=?').get(req.params.id, req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  res.json(toFront(emp));
});

router.post('/', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const { name, department, position, salary=8000, status='Active', joinDate, phone='', email='' } = req.body;
  if (!name || !department || !position) return res.status(400).json({ message: 'name, department, position required.' });
  const maxId = db.prepare('SELECT MAX(id) as m FROM employees').get().m || 1000;
  const empId = `EMP-${String(maxId + 1).padStart(4,'0')}`;
  const info = db.prepare(`
    INSERT INTO employees (employee_id,name,department,position,salary,status,join_date,phone,email,attendance,avatar)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(empId, name, department, position, salary, status, joinDate || new Date().toISOString().split('T')[0], phone, email, 100, `https://api.dicebear.com/7.x/avataaars/svg?seed=${maxId+1}`);
  const created = db.prepare('SELECT * FROM employees WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json(toFront(created));
});

router.put('/:id', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE id=? OR employee_id=?').get(req.params.id, req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  const { name=emp.name, department=emp.department, position=emp.position, salary=emp.salary, status=emp.status, phone=emp.phone, email=emp.email } = req.body;
  db.prepare('UPDATE employees SET name=?,department=?,position=?,salary=?,status=?,phone=?,email=? WHERE id=?')
    .run(name, department, position, salary, status, phone, email, emp.id);
  res.json(toFront(db.prepare('SELECT * FROM employees WHERE id=?').get(emp.id)));
});

router.delete('/:id', auth, requirePermission('hr'), (req, res) => {
  const db = getDb();
  const emp = db.prepare('SELECT * FROM employees WHERE id=? OR employee_id=?').get(req.params.id, req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  db.prepare('DELETE FROM employees WHERE id=?').run(emp.id);
  res.json({ message: 'Employee deleted.', employee: toFront(emp) });
});

module.exports = router;
