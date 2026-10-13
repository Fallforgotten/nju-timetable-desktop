// Isolated-world state; never stores selectors that could drift to another control.
globalThis.njuPagerBinding ||= {root:null,button:null,listener:null,banner:null,timer:null};
globalThis.njuCancelPagerSelection = function () {
  const state=globalThis.njuPagerBinding;
  if(state.listener)document.removeEventListener('click',state.listener,true);
  state.listener=null;clearTimeout(state.timer);state.timer=null;
  state.banner?.remove();state.banner=null;
};
globalThis.njuBoundPager = function () {
  const state=globalThis.njuPagerBinding;
  if(!state.root)return globalThis.cengkeFindPager(document);
  if(!state.root.isConnected || !state.button?.isConnected || !state.root.contains(state.button))throw new Error('指定的分页栏已刷新，请重新指定下一页按钮并检查。');
  return state.root;
};
globalThis.njuSelectPager = function () {
  globalThis.njuCancelPagerSelection();
  const state=globalThis.njuPagerBinding;state.root=null;state.button=null;
  const banner=document.createElement('div');
  banner.id='cengke-export-panel';
  banner.style.cssText='position:fixed;top:12px;right:20px;z-index:2147483647;background:#fffbe5;color:#243e35;border:2px solid #2d6c53;padding:16px;max-width:400px;font:15px/1.6 sans-serif';
  banner.textContent='请点击实际分页栏的“下一页”。本次点击只指定按钮，不会翻页。取消请点左侧“取消指定”。';
  document.body.append(banner);state.banner=banner;
  state.listener=event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const button=event.target.closest('button,[role="button"],a,input[type="button"]') || event.target.closest('.jqx-icon-arrow-right,[class*="jqx-icon-arrow-right-"]')?.parentElement;
    if(!button || banner.contains(button) || !button.getClientRects().length) {banner.textContent='未选中分页按钮，请点击实际分页栏内的下一页按钮。';return;}
    const label=button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim();
    if(/上一页|首页|末页|previous|first|last/i.test(label) || button.querySelector('.jqx-icon-arrow-left,[class*="jqx-icon-arrow-left-"]')) {banner.textContent='这是上一页、首页或末页，请选择下一页。';return;}
    let root=button.parentElement,found=null;
    for(let i=0;root && i<8;i++,root=root.parentElement) {
      const text=root.textContent.replace(/\s/g,'');
      if(text.length<1500 && [...text.matchAll(/\d+[-–—]\d+总记录数[:：]?\d+/g)].length===1 && /总页数/.test(text)) {found=root;break;}
    }
    if(!found) {banner.textContent='该按钮不在可识别的分页栏内，请重新选择。';return;}
    state.root=found;state.button=button;
    document.removeEventListener('click',state.listener,true);state.listener=null;clearTimeout(state.timer);
    banner.textContent='已指定，未翻页。请点击左侧“检查当前课表”，核对学期和总数后再导出。';
  };
  document.addEventListener('click',state.listener,true);
  state.timer=setTimeout(()=>{globalThis.njuCancelPagerSelection();},60000);
};
