const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { auth, requirePermission } = require('../middleware/auth');

const toFront = (p) => p ? ({ id:p.id, name:p.name, price:p.price, stock:p.stock, category:p.category, sales:p.sales }) : null;

router.get('/products', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const { search='', category='', lowStock } = req.query;
  let where = 'WHERE 1=1'; const params = [];
  if (search) { where += ' AND name LIKE ?'; params.push(`%${search}%`); }
  if (category && category !== 'All') { where += ' AND category=?'; params.push(category); }
  if (lowStock === 'true') { where += ' AND stock < 10'; }
  res.json(db.prepare(`SELECT * FROM canteen_products ${where}`).all(...params).map(toFront));
});

router.get('/products/summary', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const { totalRevenue } = db.prepare('SELECT SUM(price * sales) as totalRevenue FROM canteen_products').get();
  const totalItems = db.prepare('SELECT COUNT(*) as cnt FROM canteen_products').get().cnt;
  const lowStock   = db.prepare('SELECT COUNT(*) as cnt FROM canteen_products WHERE stock < 10').get().cnt;
  const today = new Date().toISOString().split('T')[0];
  const { todaySales } = db.prepare('SELECT COALESCE(SUM(total),0) as todaySales FROM canteen_transactions WHERE date=?').get(today);
  res.json({ totalRevenue: Math.round(totalRevenue||0), totalItems, lowStock, todaySales });
});

router.get('/products/:id', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM canteen_products WHERE id=?').get(parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Product not found.' });
  res.json(toFront(p));
});

router.post('/products', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const { name, price, stock=0, category='Other' } = req.body;
  if (!name || price===undefined) return res.status(400).json({ message: 'name and price required.' });
  const info = db.prepare('INSERT INTO canteen_products (name,price,stock,category,sales) VALUES (?,?,?,?,0)').run(name, price, stock, category);
  res.status(201).json(toFront(db.prepare('SELECT * FROM canteen_products WHERE id=?').get(info.lastInsertRowid)));
});

router.put('/products/:id', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM canteen_products WHERE id=?').get(parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Product not found.' });
  const { name=p.name, price=p.price, stock=p.stock, category=p.category } = req.body;
  db.prepare('UPDATE canteen_products SET name=?,price=?,stock=?,category=? WHERE id=?').run(name, price, stock, category, p.id);
  res.json(toFront(db.prepare('SELECT * FROM canteen_products WHERE id=?').get(p.id)));
});

router.delete('/products/:id', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM canteen_products WHERE id=?').get(parseInt(req.params.id));
  if (!p) return res.status(404).json({ message: 'Product not found.' });
  db.prepare('DELETE FROM canteen_products WHERE id=?').run(p.id);
  res.json({ message: 'Product deleted.', product: toFront(p) });
});

router.post('/checkout', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ message: 'items required.' });

  let total = 0;
  const processedItems = [];

  const doCheckout = db.transaction(() => {
    for (const cartItem of items) {
      const product = db.prepare('SELECT * FROM canteen_products WHERE id=?').get(cartItem.id);
      if (!product) throw { status:404, message: `Product ${cartItem.id} not found.` };
      if (product.stock < cartItem.qty) throw { status:400, message: `Insufficient stock for ${product.name}. Available: ${product.stock}` };
      db.prepare('UPDATE canteen_products SET stock=stock-?,sales=sales+? WHERE id=?').run(cartItem.qty, cartItem.qty, product.id);
      const subtotal = product.price * cartItem.qty;
      total += subtotal;
      processedItems.push({ ...toFront(product), qty: cartItem.qty, subtotal });
    }
    const now = new Date();
    const info = db.prepare('INSERT INTO canteen_transactions (items,total,date,time,cashier) VALUES (?,?,?,?,?)')
      .run(JSON.stringify(processedItems), total, now.toISOString().split('T')[0], now.toTimeString().slice(0,5), req.user.name);
    return db.prepare('SELECT * FROM canteen_transactions WHERE id=?').get(info.lastInsertRowid);
  });

  try {
    const transaction = doCheckout();
    res.status(201).json({ message: 'Checkout successful.', transaction: { ...transaction, items: JSON.parse(transaction.items), total } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});

router.get('/transactions', auth, requirePermission('canteen'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM canteen_transactions ORDER BY id DESC LIMIT 100').all();
  res.json(rows.map(t => ({ ...t, items: JSON.parse(t.items) })));
});

module.exports = router;
