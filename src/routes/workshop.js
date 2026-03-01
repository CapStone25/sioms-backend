const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

const toFront = (e) => e ? ({
  id: e.id, name: e.name, model: e.model, status: e.status,
  department: e.department, lastMaintenance: e.last_maintenance,
  nextMaintenance: e.next_maintenance, condition: e.condition,
}) : null;

// ─── Equipment ───────────────────────────────────────────────────────────────

router.get('/equipment', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const { status='', department='', search='' } = req.query;
  let where = 'WHERE 1=1'; const params = [];
  if (status && status !== 'All') { where += ' AND status=?'; params.push(status); }
  if (department) { where += ' AND department=?'; params.push(department); }
  if (search) { where += ' AND (name LIKE ? OR model LIKE ?)'; params.push(`%${search}%`,`%${search}%`); }
  res.json(db.prepare(`SELECT * FROM equipment ${where}`).all(...params).map(toFront));
});

router.get('/equipment/summary', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const total            = db.prepare('SELECT COUNT(*) as cnt FROM equipment').get().cnt;
  const active           = db.prepare("SELECT COUNT(*) as cnt FROM equipment WHERE status='Active'").get().cnt;
  const underMaintenance = db.prepare("SELECT COUNT(*) as cnt FROM equipment WHERE status='Under Maintenance'").get().cnt;
  const outOfService     = db.prepare("SELECT COUNT(*) as cnt FROM equipment WHERE status='Out of Service'").get().cnt;
  const dueSoon          = db.prepare("SELECT COUNT(*) as cnt FROM equipment WHERE next_maintenance <= date('now','+7 days')").get().cnt;
  res.json({ total, active, underMaintenance, outOfService, dueSoon });
});

router.get('/equipment/:id', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const eq = db.prepare('SELECT * FROM equipment WHERE id=?').get(parseInt(req.params.id));
  if (!eq) return res.status(404).json({ message: 'Equipment not found.' });
  res.json(toFront(eq));
});

router.post('/equipment', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const { name, model, status='Active', department='General', lastMaintenance='', nextMaintenance='', condition='Good' } = req.body;
  if (!name || !model) return res.status(400).json({ message: 'name and model required.' });
  const info = db.prepare('INSERT INTO equipment (name,model,status,department,last_maintenance,next_maintenance,condition) VALUES (?,?,?,?,?,?,?)')
    .run(name, model, status, department, lastMaintenance, nextMaintenance, condition);
  res.status(201).json(toFront(db.prepare('SELECT * FROM equipment WHERE id=?').get(info.lastInsertRowid)));
});

router.put('/equipment/:id', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const eq = db.prepare('SELECT * FROM equipment WHERE id=?').get(parseInt(req.params.id));
  if (!eq) return res.status(404).json({ message: 'Equipment not found.' });
  const { name=eq.name, model=eq.model, status=eq.status, department=eq.department,
          condition=eq.condition, lastMaintenance=eq.last_maintenance, nextMaintenance=eq.next_maintenance } = req.body;
  db.prepare('UPDATE equipment SET name=?,model=?,status=?,department=?,condition=?,last_maintenance=?,next_maintenance=? WHERE id=?')
    .run(name, model, status, department, condition, lastMaintenance, nextMaintenance, eq.id);
  res.json(toFront(db.prepare('SELECT * FROM equipment WHERE id=?').get(eq.id)));
});

router.post('/equipment/:id/maintenance', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const eq = db.prepare('SELECT * FROM equipment WHERE id=?').get(parseInt(req.params.id));
  if (!eq) return res.status(404).json({ message: 'Equipment not found.' });
  const { notes='', nextMaintenance, condition, status } = req.body;
  const today = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE equipment SET last_maintenance=?,next_maintenance=COALESCE(?,next_maintenance),condition=COALESCE(?,condition),status=COALESCE(?,status) WHERE id=?')
    .run(today, nextMaintenance||null, condition||null, status||null, eq.id);
  const logInfo = db.prepare('INSERT INTO maintenance_logs (equipment_id,equipment_name,date,notes,technician) VALUES (?,?,?,?,?)')
    .run(eq.id, eq.name, today, notes, req.user.name);
  res.json({
    message: 'Maintenance logged.',
    equipment: toFront(db.prepare('SELECT * FROM equipment WHERE id=?').get(eq.id)),
    log: db.prepare('SELECT * FROM maintenance_logs WHERE id=?').get(logInfo.lastInsertRowid),
  });
});

router.delete('/equipment/:id', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const eq = db.prepare('SELECT * FROM equipment WHERE id=?').get(parseInt(req.params.id));
  if (!eq) return res.status(404).json({ message: 'Equipment not found.' });
  db.prepare('DELETE FROM equipment WHERE id=?').run(eq.id);
  res.json({ message: 'Equipment deleted.', equipment: toFront(eq) });
});

// ─── Maintenance Logs ─────────────────────────────────────────────────────────

router.get('/maintenance-logs', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM maintenance_logs ORDER BY date DESC').all());
});

// ─── Assignments ─────────────────────────────────────────────────────────────
// BUG FIX: Was placed AFTER module.exports (unreachable). Moved before export.

router.get('/assignments', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM workshop_assignments ORDER BY id DESC').all());
});

router.post('/assignments', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const { equipmentId, assignedTo, purpose, startDate } = req.body;
  if (!equipmentId || !assignedTo || !startDate)
    return res.status(400).json({ message: 'equipmentId, assignedTo, startDate required.' });
  const eq = db.prepare('SELECT * FROM equipment WHERE id=?').get(parseInt(equipmentId));
  if (!eq) return res.status(404).json({ message: 'Equipment not found.' });
  const info = db.prepare('INSERT INTO workshop_assignments (equipment_id,equipment_name,assigned_to,purpose,start_date) VALUES (?,?,?,?,?)')
    .run(eq.id, eq.name, assignedTo, purpose || '', startDate);
  res.status(201).json(db.prepare('SELECT * FROM workshop_assignments WHERE id=?').get(info.lastInsertRowid));
});

router.patch('/assignments/:id/return', auth, requirePermission('workshop'), (req, res) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM workshop_assignments WHERE id=?').get(parseInt(req.params.id));
  if (!a) return res.status(404).json({ message: 'Assignment not found.' });
  const today = new Date().toISOString().split('T')[0];
  db.prepare("UPDATE workshop_assignments SET status='Returned',end_date=? WHERE id=?").run(today, a.id);
  res.json(db.prepare('SELECT * FROM workshop_assignments WHERE id=?').get(a.id));
});

// ─── module.exports MUST be at the END ───────────────────────────────────────
module.exports = router;
