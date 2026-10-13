const SCHOOL = 'https://ehallapp.nju.edu.cn/jwapp/sys/kcbcx/*default/index.do#/qxkcb01';
const EXTERNAL = 'https://ehallapp-nju-edu-cn-s.atrust.nju.edu.cn/jwapp/sys/kcbcx/*default/index.do#/qxkcb01';
const IMPORT = 'https://cengke-parse-probe.app.workbuddy.host/';
function schoolNavigation(raw) {
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (u.hostname === 'nju.edu.cn' || u.hostname.endsWith('.nju.edu.cn')); } catch { return false; }
}
function sourceFor(raw) {
  if (!schoolNavigation(raw)) return null;
  const u = new URL(raw);
  if (!['ehallapp.nju.edu.cn', 'ehallapp-nju-edu-cn-s.atrust.nju.edu.cn'].includes(u.hostname)) return null;
  if (u.pathname.startsWith('/jwapp/sys/kcbcx/')) return 'schoolwide';
  if (u.pathname.startsWith('/jwapp/sys/wdkb/')) return 'personal';
  return null;
}
function validResult(data) {
  return data?.format === 'cengke-nju-visible-v1' && typeof data.term === 'string' && data.term.length < 100 && Array.isArray(data.rows) && data.rows.length > 0 && data.rows.length <= 20000 && data.rows.every(r => r && ['name','code','teacher','schedule'].every(k => typeof r[k] === 'string' && r[k].length <= 4000));
}
module.exports = { SCHOOL, EXTERNAL, IMPORT, schoolNavigation, sourceFor, validResult };
