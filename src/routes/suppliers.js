const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

const toFront = (s) => s ? ({
  id: s.id, name: s.name, contact: s.contact, email: s.email,
  category: s.category, totalOrders: s.total_orders, totalValue: s.total_value,
  status: s.status, rating: s.rating, lastOrder: s.last_order,
}) : null;

router.get('/', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const { search='', category='', status='', page=1, limit=20 } = req.query;
  let where = 'WHERE 1=1'; const params = [];
  if (search)   { where += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`,`%${search}%`); }
  if (category && category !== 'All') { where += ' AND category=?'; params.push(category); }
  if (status)   { where += ' AND status=?'; params.push(status); }
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM suppliers ${where}`).get(...params).cnt;
  const offset = (parseInt(page)-1)*parseInt(limit);
  const data = db.prepare(`SELECT * FROM suppliers ${where} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  res.json({ data: data.map(toFront), total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/summary', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const total  = db.prepare('SELECT COUNT(*) as cnt FROM suppliers').get().cnt;
  const active = db.prepare("SELECT COUNT(*) as cnt FROM suppliers WHERE status='Active'").get().cnt;
  const { totalValue, avgRating } = db.prepare('SELECT SUM(total_value) as totalValue, AVG(rating) as avgRating FROM suppliers').get();
  res.json({ total, active, inactive: total-active, totalValue: Math.round(totalValue||0), avgRating: parseFloat((avgRating||0).toFixed(1)) });
});

router.get('/:id', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT * FROM suppliers WHERE id=?').get(parseInt(req.params.id));
  if (!s) return res.status(404).json({ message: 'Supplier not found.' });
  res.json(toFront(s));
});

router.post('/', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const { name, contact='', email='', category='General' } = req.body;
  if (!name) return res.status(400).json({ message: 'name required.' });
  const info = db.prepare("INSERT INTO suppliers (name,contact,email,category,total_orders,total_value,status,rating,last_order) VALUES (?,?,?,?,0,0,'Active',3.0,date('now'))")
    .run(name, contact, email, category);
  res.status(201).json(toFront(db.prepare('SELECT * FROM suppliers WHERE id=?').get(info.lastInsertRowid)));
});

router.put('/:id', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT * FROM suppliers WHERE id=?').get(parseInt(req.params.id));
  if (!s) return res.status(404).json({ message: 'Supplier not found.' });
  const { name=s.name, contact=s.contact, email=s.email, category=s.category, status=s.status, rating=s.rating } = req.body;
  db.prepare('UPDATE suppliers SET name=?,contact=?,email=?,category=?,status=?,rating=? WHERE id=?').run(name, contact, email, category, status, rating, s.id);
  res.json(toFront(db.prepare('SELECT * FROM suppliers WHERE id=?').get(s.id)));
});

router.delete('/:id', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const s = db.prepare('SELECT * FROM suppliers WHERE id=?').get(parseInt(req.params.id));
  if (!s) return res.status(404).json({ message: 'Supplier not found.' });
  db.prepare('DELETE FROM suppliers WHERE id=?').run(s.id);
  res.json({ message: 'Supplier deleted.', supplier: toFront(s) });
});

module.exports = router;

// --- Purchase Orders ---
router.get('/purchase-orders', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all();
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

router.post('/purchase-orders', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const { supplierId, items, notes } = req.body;
  if (!supplierId || !items || !items.length) return res.status(400).json({ message: 'supplierId and items required.' });
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id=?').get(parseInt(supplierId));
  if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
  const total = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  const maxId = db.prepare('SELECT MAX(id) as m FROM purchase_orders').get().m || 0;
  const poNumber = `PO-${String(maxId + 1).padStart(5, '0')}`;
  const info = db.prepare("INSERT INTO purchase_orders (po_number,supplier_id,supplier,items,total,notes,created_by) VALUES (?,?,?,?,?,?,?)")
    .run(poNumber, supplier.id, supplier.name, JSON.stringify(items), total, notes || '', req.user.name);
  db.prepare('UPDATE suppliers SET total_orders=total_orders+1,total_value=total_value+?,last_order=date("now") WHERE id=?').run(total, supplier.id);
  const row = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, items: JSON.parse(row.items) });
});

router.patch('/purchase-orders/:id/status', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!['Pending','Approved','Delivered','Cancelled'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(parseInt(req.params.id));
  if (!po) return res.status(404).json({ message: 'PO not found.' });
  const today = new Date().toISOString().split('T')[0];
  db.prepare('UPDATE purchase_orders SET status=?,delivery_date=CASE WHEN ? = "Delivered" THEN ? ELSE delivery_date END WHERE id=?')
    .run(status, status, today, po.id);
  // If delivered, update inventory quantities
  if (status === 'Delivered') {
    const items = JSON.parse(po.items);
    for (const item of items) {
      if (item.inventoryId) {
        db.prepare('UPDATE inventory SET quantity=quantity+?,last_updated=date("now") WHERE id=?').run(item.quantity, item.inventoryId);
      }
    }
  }
  const updated = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(po.id);
  res.json({ ...updated, items: JSON.parse(updated.items) });
});

router.delete('/purchase-orders/:id', auth, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(parseInt(req.params.id));
  if (!po) return res.status(404).json({ message: 'PO not found.' });
  db.prepare('DELETE FROM purchase_orders WHERE id=?').run(po.id);
  res.json({ message: 'PO deleted.' });
});
