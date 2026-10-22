'use strict';
const db = require('./db');
const { scopeClause, allowedAffiliateIds } = require('./scope');

function rangeClause(range) {
  switch (range) {
    case 'today': return "date(created_at) = date('now')";
    case '7d':    return "date(created_at) >= date('now','-6 days')";
    case 'mtd':   return "strftime('%Y-%m', created_at) = strftime('%Y-%m','now')";
    case 'all':
    default:      return '1=1';
  }
}

function summary(user, range) {
  const sc = scopeClause(user);
  const rc = rangeClause(range);
  const row = db.prepare(
    "SELECT COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS orders " +
    "FROM sales WHERE status='paid' AND " + sc.sql + " AND " + rc
  ).get(...sc.params);
  const signups = db.prepare(
    "SELECT COUNT(*) AS n FROM signups WHERE " + scopeClause(user).sql + " AND " + rc
  ).get(...sc.params);
  // Commission: sum per-affiliate commission for affiliate/BD scope.
  const comm = db.prepare(
    "SELECT COALESCE(SUM(s.amount * a.commission_pct/100.0),0) AS affiliate_commission " +
    "FROM sales s JOIN affiliates a ON a.id=s.affiliate_id " +
    "WHERE s.status='paid' AND " + scopeClause(user,'s.affiliate_id').sql + " AND " + rangeClause(range).replace(/created_at/g,'s.created_at')
  ).get(...scopeClause(user,'s.affiliate_id').params);
  let bdCommission = null;
  if (user.role === 'bd' && user.bd_id) {
    const bd = db.prepare('SELECT commission_pct FROM bds WHERE id=?').get(user.bd_id);
    if (bd) bdCommission = +(row.revenue * (bd.commission_pct||0) / 100).toFixed(2);
  }
  return {
    revenue: +row.revenue.toFixed(2),
    orders: row.orders,
    signups: signups.n,
    affiliate_commission: +comm.affiliate_commission.toFixed(2),
    bd_commission: bdCommission
  };
}

function timeseries(user, range) {
  const sc = scopeClause(user);
  const rc = rangeClause(range);
  const rows = db.prepare(
    "SELECT date(created_at) AS day, COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS orders " +
    "FROM sales WHERE status='paid' AND " + sc.sql + " AND " + rc + " GROUP BY day ORDER BY day"
  ).all(...sc.params);
  return rows.map(r => ({ day: r.day, revenue: +r.revenue.toFixed(2), orders: r.orders }));
}

function affiliateTable(user, range) {
  const sc = scopeClause(user, 'a.id');
  const rc = rangeClause(range).replace(/created_at/g, 's.created_at');
  const rows = db.prepare(
    "SELECT a.id, a.code, a.referral_id, a.name, a.commission_pct, b.name AS bd_name, " +
    " (SELECT COUNT(*) FROM signups g WHERE g.affiliate_id=a.id) AS signups, " +
    " COUNT(s.id) AS sales_count, " +
    " COALESCE(SUM(CASE WHEN s.status='paid' THEN s.amount ELSE 0 END),0) AS revenue, " +
    " MAX(s.created_at) AS last_sale " +
    "FROM affiliates a LEFT JOIN bds b ON b.id=a.bd_id " +
    "LEFT JOIN sales s ON s.affiliate_id=a.id AND s.status='paid' AND " + rc + " " +
    "WHERE " + sc.sql + " " +
    "GROUP BY a.id ORDER BY revenue DESC"
  ).all(...sc.params);
  return rows.map(r => ({
    id: r.id, code: r.code, referral_id: r.referral_id, name: r.name, bd_name: r.bd_name,
    commission_pct: r.commission_pct,
    signups: r.signups, sales_count: r.sales_count,
    revenue: +(r.revenue||0).toFixed(2),
    commission: +(((r.revenue||0) * (r.commission_pct||0))/100).toFixed(2),
    last_sale: r.last_sale
  }));
}

function leaderboardBD(user, range) {
  // Only admin gets a cross-BD leaderboard; BDs/affiliates get [] (not authorized).
  if (user.role !== 'admin') return [];
  const rc = rangeClause(range).replace(/created_at/g, 's.created_at');
  return db.prepare(
    "SELECT b.id, b.name, b.commission_pct, " +
    " COUNT(DISTINCT a.id) AS affiliates, " +
    " COALESCE(SUM(CASE WHEN s.status='paid' THEN s.amount ELSE 0 END),0) AS revenue " +
    "FROM bds b LEFT JOIN affiliates a ON a.bd_id=b.id " +
    "LEFT JOIN sales s ON s.affiliate_id=a.id AND " + rc + " " +
    "GROUP BY b.id ORDER BY revenue DESC"
  ).all().map(r => ({
    id:r.id, name:r.name, affiliates:r.affiliates, revenue:+(r.revenue||0).toFixed(2),
    commission: +(((r.revenue||0)*(r.commission_pct||0))/100).toFixed(2)
  }));
}

function products(user, range) {
  const sc = scopeClause(user);
  const rc = rangeClause(range);
  return db.prepare(
    "SELECT COALESCE(product,'(unknown)') AS product, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue " +
    "FROM sales WHERE status='paid' AND " + sc.sql + " AND " + rc + " GROUP BY product ORDER BY revenue DESC"
  ).all(...sc.params).map(r => ({ product:r.product, orders:r.orders, revenue:+r.revenue.toFixed(2) }));
}

function exportRows(user, range) {
  const sc = scopeClause(user, 's.affiliate_id');
  const rc = rangeClause(range).replace(/created_at/g, 's.created_at');
  return db.prepare(
    "SELECT s.created_at, a.code AS affiliate_code, a.name AS affiliate_name, b.name AS bd_name, " +
    " s.product, s.amount, s.status, s.customer_email " +
    "FROM sales s LEFT JOIN affiliates a ON a.id=s.affiliate_id LEFT JOIN bds b ON b.id=a.bd_id " +
    "WHERE " + sc.sql + " AND " + rc + " ORDER BY s.created_at DESC"
  ).all(...sc.params);
}

module.exports = { summary, timeseries, affiliateTable, leaderboardBD, products, exportRows };
