const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { SCHOOL, EXTERNAL, IMPORT, schoolNavigation, sourceFor, validResult } = require('./policy.cjs');
const selfTest = !app.isPackaged && process.argv.includes('--self-test');
const uiURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const fixtureURL = pathToFileURL(path.join(__dirname, 'tests/fixture.html')).href;
const extractCode = fs.readFileSync(path.join(__dirname, 'vendor/extract.js'), 'utf8');
const paginateCode = fs.readFileSync(path.join(__dirname, 'vendor/paginate.js'), 'utf8');
const bindingCode = fs.readFileSync(path.join(__dirname, 'pager-binding.js'), 'utf8');
const collectorContext = {}; vm.runInNewContext(paginateCode, collectorContext);
let win, page, stopped = false, checked = null, result = null, operation = false;
let state = {busy:false,ready:false,hasResult:false};
function update(change) { state={...state,...change}; if(win && !win.isDestroyed()) win.webContents.send('assistant:status',state); }
function context(term) {
  const url=page.webContents.getURL();
  const source=sourceFor(url) || (selfTest && url===fixtureURL ? 'schoolwide' : null);
  if(!source) throw new Error('请先完成学校登录，进入“学生组 → 全部课程”并搜索，然后检查课表。');
  if(typeof term!=='string' || term.length>60) throw new Error('学期格式无效');
  return {source,term:term.trim()};
}
async function run(code) {
  // Electron replaces exceptions crossing this boundary with a generic English error.
  // Return a serializable envelope from the isolated world instead of throwing there.
  let reply;
  try {
    reply=await page.webContents.executeJavaScriptInIsolatedWorld(999,[{code:`(async () => {
      try { return {ok:true,value:await (${code})}; }
      catch(error) { return {ok:false,message:String(error?.message || '课表读取失败').slice(0,1200)}; }
    })()`}],true);
  } catch {
    throw new Error('课表页面执行环境暂时不可用。请等待页面加载完成后重新检查；若仍失败，请反馈助手版本及当前页面名称。');
  }
  if(!reply?.ok) throw new Error(reply?.message || '未收到课表页面的有效响应，请重新检查。');
  return reply.value;
}
function pageGuard() {
  return `if (!(${sourceFor.toString()})(location.href) && !(${JSON.stringify(selfTest)} && location.href===${JSON.stringify(fixtureURL)})) throw new Error('页面已离开课表，请重新检查。');`;
}
async function readPage(term) {
  const options=context(term);
  return run(`(() => { const schoolNavigation=${schoolNavigation.toString()}; ${pageGuard()}
    ${extractCode}\n${paginateCode}\n${bindingCode}
    globalThis.njuCancelPagerSelection();
    const data=globalThis.cengkeNjuExtract(document,${JSON.stringify(options)});
    if(data.error) {
      const hint=/学期/.test(data.error) ? '请在左侧填写完整学期（例如：2026-2027学年 第1学期），然后重新检查。' : '请选择学生组 → 全部课程，点击搜索并等待列表加载。';
      const shape=data.diagnostics ? '\\n结构诊断（不含课程内容）：'+JSON.stringify(data.diagnostics) : '';
      throw new Error(hint+'\\n'+data.error+shape);
    }
    const root=globalThis.njuBoundPager();
    const m=root.textContent.replace(/\\s/g,'').match(/(\\d+)[-–—](\\d+)总记录数[:：]?(\\d+)/);
    if(!m) throw new Error('无法识别分页，请等待列表加载完毕。');
    return {data,start:Number(m[1]),end:Number(m[2]),total:Number(m[3])};
  })()`);
}
async function nextPage(term) {
  context(term);
  await run(`(() => {
    const schoolNavigation=${schoolNavigation.toString()}; ${pageGuard()}
    const root=globalThis.njuBoundPager();
    const icons=[...root.querySelectorAll('.jqx-icon-arrow-right, [class*="jqx-icon-arrow-right-"]')];
    const labelled=[...root.querySelectorAll('button,a,[role="button"],[title],[aria-label]')].filter(el=>/^(下一页|Next(?: page)?)$/i.test(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent.trim()));
    const bound=globalThis.njuPagerBinding.button;
    const buttons=(bound ? [bound] : [...new Set([...labelled,...icons.map(el=>el.closest('button,[role="button"]')||el.parentElement)])]).filter(el=>el.getClientRects().length);
    if(buttons.length!==1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled')==='true' || /jqx-fill-state-disabled/.test(buttons[0].className)) throw new Error('无法确认下一页按钮，已停止。请回到第一页，点左侧“指定下一页按钮”，再检查。');
    buttons[0].click();
  })()`);
}
async function check(term) {
  checked=null;update({ready:false,message:'正在检查页面、学期和分页…'});
  const current=await readPage(term);
  if(current.start!==1) throw new Error('请在学校列表回到第一页，再检查。');
  if(!validResult(current.data) || current.total<1 || current.total>20000) throw new Error('课表为空、字段不完整或超过 20000 条，请缩小筛选范围。');
  checked={term,url:page.webContents.getURL(),signature:JSON.stringify(current)};
  update({ready:true,message:`学期：${current.data.term}\n当前页 ${current.data.rows.length} 个教学班；筛选总数 ${current.total}。\n${current.data.source==='personal'?'这是个人已选课列表。':'这是全校查询的当前筛选结果。'}\n请核对学期和筛选范围后导出。`});
}
async function save() {
  if(!validResult(result)) throw new Error('没有可保存的课程结果。');
  const snapshot=result;
  const choice=await dialog.showSaveDialog(win,{title:snapshot.complete?'保存全部课表':'保存部分课表（未全部完成）',defaultPath:path.join(app.getPath('downloads'),snapshot.complete?'nju-schoolwide-all.json':'nju-schoolwide-partial.json'),filters:[{name:'课表 JSON',extensions:['json']}]});
  if(choice.canceled) {update({message:'已取消保存；结果仍在内存中，可再次点击“保存导出结果 JSON”。'});return;}
  await fs.promises.writeFile(choice.filePath,JSON.stringify(snapshot,null,2),'utf8');
  update({message:`${snapshot.complete?'全部':'部分'}结果已保存：${snapshot.rows.length} 个教学班。\n${choice.filePath}\n打开蹭课网后，手动选择此文件导入。`});
}
async function exportAll(term, confirm=true) {
  if(!checked || checked.term!==term || checked.url!==page.webContents.getURL()) throw new Error('请先重新检查当前课表。');
  const fresh=await readPage(term);
  if(JSON.stringify(fresh)!==checked.signature) {checked=null;update({ready:false});throw new Error('课表或筛选已变化，请重新检查。');}
  if(confirm) {
    const answer=await dialog.showMessageBox(win,{type:'question',buttons:['开始导出','取消'],defaultId:1,cancelId:1,title:'确认导出范围',message:`${fresh.data.term}\n当前筛选共 ${fresh.total} 个教学班`,detail:'仅导出当前账号可查看的课程字段。过程中请勿更改筛选、学期或手动翻页。完成后由你选择本机保存位置。'});
    if(answer.response!==0)return;
  }
  stopped=false;result=null;checked=null;update({busy:true,ready:false,hasResult:false,message:'开始读取课程…'});
  try {
    result=await collectorContext.cengkeCollectPages({read:()=>readPage(term),next:()=>nextPage(term),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),stopped:()=>stopped,progress:message=>update({message})});
    update({hasResult:validResult(result),message:`${result.complete?'全部完成':'未全部完成'}：${result.reason}\n已保留 ${result.rows.length} 个教学班。${result.complete?'请选择保存位置。':'如需保留，请点击保存部分结果。'}`});
  } finally {update({busy:false});}
  if(result.complete && confirm) await save();
}
async function action(name,term='') {
  if(name==='stop') {stopped=true;update({message:'正在停止，已读到的课程会保留供手动保存。'});return;}
  if(operation || state.busy) throw new Error('请等待当前操作完成。');
  operation=true;
  try {
    if(name==='open' || name==='external') {
      checked=null;update({ready:false,message:'请在右侧自行登录，选择学生组、全部课程和学期。'});
      await page.webContents.loadURL(name==='open'?SCHOOL:EXTERNAL);
    } else if(name==='select-pager' || name==='cancel-pager') {
      context(term);checked=null;update({ready:false});
      await run(`(() => {const schoolNavigation=${schoolNavigation.toString()};${pageGuard()}\n${bindingCode}\n globalThis.${name==='select-pager'?'njuSelectPager':'njuCancelPagerSelection'}();})()`);
      update({message:name==='select-pager'?'请点击右侧学校页面实际分页栏的下一页按钮（只指定，不翻页），然后点击“检查当前课表”。60 秒内未选择会自动取消。':'已取消指定操作。可重新检查或再次指定。'});
    } else if(name==='check') await check(term);
    else if(name==='export') await exportAll(term);
    else if(name==='save') await save();
    else if(name==='import') await shell.openExternal(IMPORT);
    else throw new Error('未知操作');
  } finally {operation=false;}
}
app.whenReady().then(async()=>{
  const schoolSession=session.fromPartition(`nju-ephemeral-${Date.now()}`,{cache:false});
  schoolSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  schoolSession.setPermissionCheckHandler(()=>false);
  schoolSession.on('will-download',event=>event.preventDefault());
  win=new BrowserWindow({width:1320,height:940,minWidth:960,minHeight:720,show:!selfTest,title:'南大课表导出助手 v0.1.2',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  win.setMenu(null);
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  page=new WebContentsView({webPreferences:{session:schoolSession,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false,devTools:false}});
  win.contentView.addChildView(page);
  const resize=()=>{const [width,height]=win.getContentSize();page.setBounds({x:330,y:0,width:Math.max(1,width-330),height});};
  resize();win.on('resize',resize);
  const guard=(event,url)=>{if(!schoolNavigation(url)){event.preventDefault();update({message:'已阻止离开南大 HTTPS 域名的跳转。若学校登录需要其他入口，请反馈域名，不要提供密码或验证码。'});}};
  page.webContents.on('will-navigate',guard);
  page.webContents.on('will-redirect',guard);
  page.webContents.setWindowOpenHandler(({url})=>{
    if(schoolNavigation(url)) page.webContents.loadURL(url).catch(()=>update({message:'学校页面加载失败，请尝试校外访问入口。'}));
    return {action:'deny'};
  });
  page.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame){checked=null;stopped=true;update({ready:false});}});
  page.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame && code!==-3)update({message:'学校页面加载失败，请检查网络或尝试校外访问入口。'});});
  ipcMain.handle('assistant:action',async(event,name,term)=>{
    if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || event.senderFrame.url!==uiURL) throw new Error('非法调用来源');
    try {return await action(name,term);} catch(error){update({message:error.message});return {error:error.message};}
  });
  win.on('closed',()=>{stopped=true;if(!page.webContents.isDestroyed())page.webContents.close();});
  win.on('close',event=>{
    if(!selfTest && (state.busy || result?.rows?.length)) {
      const answer=dialog.showMessageBoxSync(win,{type:'question',buttons:['继续使用','退出'],defaultId:0,cancelId:0,message:'退出导出助手？',detail:'正在进行的导出将停止，未保存的结果会丢失。已保存到磁盘的 JSON 不受影响。'});
      if(answer!==1)event.preventDefault();
    }
  });
  await win.loadFile(path.join(__dirname,'index.html'));
  await page.webContents.loadFile(path.join(__dirname,'welcome.html'));
  if(selfTest) {
    try {await require('./tests/smoke.cjs')({win,page,check,exportAll,run,action,getResult:()=>result,fixtureURL,dialog});app.exit(0);}
    catch(error){console.error(error);app.exit(1);}
  }
});
app.on('window-all-closed',()=>app.quit());
