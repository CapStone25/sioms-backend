const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

const toFront = (i) => i ? ({
  id: i.id, sku: i.sku, name: i.name, category: i.category,
  quantity: i.quantity, minStock: i.min_stock, unit: i.unit,
  unitPrice: i.unit_price, supplier: i.supplier, location: i.location,
  lastUpdated: i.last_updated,
}) : null;

router.get('/', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const { search='', category='', lowStock, page=1, limit=20 } = req.query;
  let where = 'WHERE 1=1'; const params = [];
  if (search)           { where += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`,`%${search}%`); }
  if (category && category !== 'All') { where += ' AND category=?'; params.push(category); }
  if (lowStock === 'true') { where += ' AND quantity <= min_stock'; }
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM inventory ${where}`).get(...params).cnt;
  const offset = (parseInt(page)-1)*parseInt(limit);
  const data = db.prepare(`SELECT * FROM inventory ${where} LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  res.json({ data: data.map(toFront), total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/summary', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const totalItems = db.prepare('SELECT COUNT(*) as cnt FROM inventory').get().cnt;
  const lowStock = db.prepare('SELECT COUNT(*) as cnt FROM inventory WHERE quantity <= min_stock').get().cnt;
  const { totalValue } = db.prepare('SELECT SUM(quantity * unit_price) as totalValue FROM inventory').get();
  const categories = db.prepare('SELECT COUNT(DISTINCT category) as cnt FROM inventory').get().cnt;
  res.json({ totalItems, lowStock, totalValue: Math.round(totalValue||0), categories });
});

router.get('/suppliers-list', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const suppliers = db.prepare("SELECT id, name FROM suppliers WHERE status='Active' ORDER BY name").all();
  res.json(suppliers);
});

router.get('/:id', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM inventory WHERE id=? OR sku=?').get(req.params.id, req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found.' });
  res.json(toFront(item));
});

router.post('/', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const { name, category, quantity=0, minStock=10, unit='pcs', unitPrice=0, supplier='', location='' } = req.body;
  if (!name || !category) return res.status(400).json({ message: 'name and category required.' });
  const maxId = db.prepare('SELECT MAX(id) as m FROM inventory').get().m || 10000;
  const sku = `SKU-${String(maxId+1).padStart(5,'0')}`;
  const info = db.prepare('INSERT INTO inventory (sku,name,category,quantity,min_stock,unit,unit_price,supplier,location) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(sku, name, category, quantity, minStock, unit, unitPrice, supplier, location);
  res.status(201).json(toFront(db.prepare('SELECT * FROM inventory WHERE id=?').get(info.lastInsertRowid)));
});

router.put('/:id', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM inventory WHERE id=?').get(parseInt(req.params.id));
  if (!item) return res.status(404).json({ message: 'Item not found.' });
  const { name=item.name, category=item.category, quantity=item.quantity, min_stock=item.min_stock, unit=item.unit, unit_price=item.unit_price, supplier=item.supplier, location=item.location } = req.body;
  db.prepare('UPDATE inventory SET name=?,category=?,quantity=?,min_stock=?,unit=?,unit_price=?,supplier=?,location=?,last_updated=date("now") WHERE id=?')
    .run(name, category, quantity, min_stock, unit, unit_price, supplier, location, item.id);
  res.json(toFront(db.prepare('SELECT * FROM inventory WHERE id=?').get(item.id)));
});

router.patch('/:id/quantity', auth, requirePermission('inventory'), (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM inventory WHERE id=?').get(parseInt(req.params.id));
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    const { quantity, operation='set' } = req.body;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ message: 'Invalid quantity.' });
    let newQty = item.quantity;
    if (operation === 'add')           newQty = newQty + qty;
    else if (operation === 'subtract') newQty = Math.max(0, newQty - qty);
    else                               newQty = qty;
    db.prepare('UPDATE inventory SET quantity=?,last_updated=date("now") WHERE id=?').run(newQty, item.id);
    res.json(toFront(db.prepare('SELECT * FROM inventory WHERE id=?').get(item.id)));
  } catch (err) {
    console.error('PATCH /inventory quantity error:', err);
    res.status(500).json({ message: err.message || 'Failed to update quantity.' });
  }
});

router.delete('/:id', auth, requirePermission('inventory'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM inventory WHERE id=?').get(parseInt(req.params.id));
  if (!item) return res.status(404).json({ message: 'Item not found.' });
  db.prepare('DELETE FROM inventory WHERE id=?').run(item.id);
  res.json({ message: 'Item deleted.', item: toFront(item) });
});

module.exports = router;
