const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
  const {packager}=await import('@electron/packager');
  const root=__dirname,version=require('./package.json').version;
  // Fixed file allowlist: never package workspace data, .env, profiles or course exports.
  const stage=path.join(root,'stage');await fs.mkdir(path.join(stage,'vendor'),{recursive:true});
  for(const name of ['main.cjs','pager-binding.js','policy.cjs','preload.cjs','index.html','style.css','renderer.js','welcome.html'])await fs.copyFile(path.join(root,name),path.join(stage,name));
  for(const name of ['extract.js','paginate.js'])await fs.copyFile(path.join(root,'vendor',name),path.join(stage,'vendor',name));
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'nju-timetable-desktop',productName:'南大课表导出助手',version,main:'main.cjs',license:'MIT'},null,2));
  const outputs=await packager({dir:stage,electronZipDir:process.env.NJU_ELECTRON_ZIP_DIR || undefined,out:path.join(root,'release',version),name:'NJU-Timetable-Assistant',platform:'win32',arch:'x64',electronVersion:require('./node_modules/electron/package.json').version,overwrite:false,asar:false,prune:false,appVersion:version,appCopyright:'Independent community tool. Not affiliated with Nanjing University.'});
  for(const dir of outputs) {
    await fs.copyFile(path.join(root,'使用说明.txt'),path.join(dir,'使用说明.txt'));
    await fs.copyFile(path.join(root,'LICENSE'),path.join(dir,'LICENSE-app.txt'));
  }
  console.log(outputs.join('\n'));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
