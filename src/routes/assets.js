const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

const toFront = (a) => a ? ({
  id: a.id, assetId: a.asset_id, name: a.name, assignedTo: a.assigned_to,
  employeeId: a.employee_id, assignDate: a.assign_date, returnDate: a.return_date,
  status: a.status, condition: a.condition,
}) : null;

router.get('/', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const { status='', employeeId='', search='' } = req.query;
  let where = 'WHERE 1=1'; const params = [];
  if (status && status !== 'All') { where += ' AND status=?'; params.push(status); }
  if (employeeId) { where += ' AND employee_id=?'; params.push(employeeId); }
  if (search) { where += ' AND (name LIKE ? OR assigned_to LIKE ? OR asset_id LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  res.json(db.prepare(`SELECT * FROM assets ${where}`).all(...params).map(toFront));
});

router.get('/summary', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const total    = db.prepare('SELECT COUNT(*) as cnt FROM assets').get().cnt;
  const inUse    = db.prepare("SELECT COUNT(*) as cnt FROM assets WHERE status='In Use'").get().cnt;
  const returned = db.prepare("SELECT COUNT(*) as cnt FROM assets WHERE status='Returned'").get().cnt;
  const conditions = {};
  db.prepare("SELECT condition, COUNT(*) as cnt FROM assets GROUP BY condition").all()
    .forEach(r => { conditions[r.condition] = r.cnt; });
  res.json({ total, inUse, returned, conditions });
});

router.get('/employees-list', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  res.json(db.prepare("SELECT id, employee_id, name FROM employees WHERE status='Active' ORDER BY name").all()
    .map(e => ({ id: e.id, employeeId: e.employee_id, name: e.name })));
});

router.get('/:id', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM assets WHERE id=? OR asset_id=?').get(req.params.id, req.params.id);
  if (!a) return res.status(404).json({ message: 'Asset not found.' });
  res.json(toFront(a));
});

router.post('/', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const { name, assignedTo, employeeId, assignDate, condition='Good' } = req.body;
  if (!name || !assignedTo || !employeeId) return res.status(400).json({ message: 'name, assignedTo, employeeId required.' });
  const maxId = db.prepare('SELECT MAX(id) as m FROM assets').get().m || 0;
  const assetId = `ASSET-${String(maxId+1).padStart(3,'0')}`;
  const info = db.prepare("INSERT INTO assets (asset_id,name,assigned_to,employee_id,assign_date,status,condition) VALUES (?,?,?,?,?,'In Use',?)")
    .run(assetId, name, assignedTo, employeeId, assignDate || new Date().toISOString().split('T')[0], condition);
  res.status(201).json(toFront(db.prepare('SELECT * FROM assets WHERE id=?').get(info.lastInsertRowid)));
});

router.put('/:id', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM assets WHERE id=? OR asset_id=?').get(req.params.id, req.params.id);
  if (!a) return res.status(404).json({ message: 'Asset not found.' });
  const { name=a.name, assigned_to=a.assigned_to, employee_id=a.employee_id, status=a.status, condition=a.condition } = req.body;
  db.prepare('UPDATE assets SET name=?,assigned_to=?,employee_id=?,status=?,condition=? WHERE id=?').run(name, assigned_to, employee_id, status, condition, a.id);
  res.json(toFront(db.prepare('SELECT * FROM assets WHERE id=?').get(a.id)));
});

router.post('/:id/return', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM assets WHERE id=? OR asset_id=?').get(req.params.id, req.params.id);
  if (!a) return res.status(404).json({ message: 'Asset not found.' });
  const today = new Date().toISOString().split('T')[0];
  const condition = req.body.condition || a.condition;
  db.prepare("UPDATE assets SET status='Returned',return_date=?,condition=? WHERE id=?").run(today, condition, a.id);
  res.json({ message: 'Asset returned.', asset: toFront(db.prepare('SELECT * FROM assets WHERE id=?').get(a.id)) });
});

router.delete('/:id', auth, requirePermission('assets'), (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM assets WHERE id=? OR asset_id=?').get(req.params.id, req.params.id);
  if (!a) return res.status(404).json({ message: 'Asset not found.' });
  db.prepare('DELETE FROM assets WHERE id=?').run(a.id);
  res.json({ message: 'Asset deleted.', asset: toFront(a) });
});

module.exports = router;
