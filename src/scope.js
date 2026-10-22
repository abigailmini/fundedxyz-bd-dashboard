'use strict';
const db = require('./db');

// Returns the set of affiliate ids this user may see.
// admin -> { all:true }; bd -> affiliates under their bd; affiliate -> own id only.
function allowedAffiliateIds(user) {
  if (user.role === 'admin') return { all: true };
  if (user.role === 'bd') {
    if (!user.bd_id) return { ids: [] };
    const rows = db.prepare('SELECT id FROM affiliates WHERE bd_id=?').all(user.bd_id);
    return { ids: rows.map(r => r.id) };
  }
  if (user.role === 'affiliate') {
    return { ids: user.affiliate_id ? [user.affiliate_id] : [] };
  }
  return { ids: [] };
}

// Build a SQL "WHERE" fragment + params that restrict sales/affiliate rows.
// column = the affiliate_id column name in the query (default 'affiliate_id').
function scopeClause(user, column) {
  column = column || 'affiliate_id';
  const scope = allowedAffiliateIds(user);
  if (scope.all) return { sql: '1=1', params: [] };
  if (!scope.ids.length) return { sql: '1=0', params: [] };
  const marks = scope.ids.map(() => '?').join(',');
  return { sql: column + ' IN (' + marks + ')', params: scope.ids.slice() };
}

module.exports = { allowedAffiliateIds, scopeClause };
