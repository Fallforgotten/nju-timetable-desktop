const {test}=require('node:test');
const assert=require('node:assert/strict');
const {schoolNavigation,sourceFor,SCHOOL,EXTERNAL,validResult}=require('../policy.cjs');
test('登录域名允许 HTTPS 南大域，拒绝混淆域名和非网页协议',()=>{
  for(const url of [SCHOOL,EXTERNAL,'https://authserver.nju.edu.cn/authserver/login'])assert.equal(schoolNavigation(url),true);
  for(const url of ['https://nju.edu.cn.evil.example/','https://evilnju.edu.cn/','http://ehallapp.nju.edu.cn/','file:///C:/secret','javascript:alert(1)','https://a:b@nju.edu.cn/','https://nju.edu.cn:8443/'])assert.equal(schoolNavigation(url),false,url);
});
test('提取范围比登录域名更窄，不在认证页或其他系统读取 DOM',()=>{
  assert.equal(sourceFor(SCHOOL),'schoolwide');assert.equal(sourceFor(EXTERNAL),'schoolwide');
  for(const url of ['https://authserver.nju.edu.cn/authserver/login','https://ehallapp.nju.edu.cn/other','https://other.nju.edu.cn/jwapp/sys/kcbcx/'])assert.equal(sourceFor(url),null);
});
test('保存前校验格式、空结果与字段长度',()=>{
  const data={format:'cengke-nju-visible-v1',term:'2026-2027学年 第1学期',rows:[{name:'虚构课',code:'DEMO',teacher:'虚构教师',schedule:'周一 1-2节'}]};
  assert.equal(validResult(data),true);assert.equal(validResult({...data,rows:[]}),false);
  assert.equal(validResult({...data,rows:[{...data.rows[0],schedule:4}]}),false);
  assert.equal(validResult({...data,rows:[{...data.rows[0],name:'x'.repeat(4001)}]}),false);
});
