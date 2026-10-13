let pending = false, state = {busy:false,ready:false,hasResult:false};
const status = document.getElementById('status'), term = document.getElementById('term');
function render() {
  document.querySelectorAll('button[data-action]').forEach(b => b.disabled = pending || (state.busy && !['stop'].includes(b.dataset.action)));
  document.getElementById('export').disabled = pending || state.busy || !state.ready;
  document.getElementById('stop').hidden = !state.busy;
  document.getElementById('save').hidden = !state.hasResult;
  term.disabled = state.busy || pending;
}
window.assistant.listen(update => {state = {...state,...update}; if(update.busy)pending=false;if(update.message) status.textContent=update.message;render();});
term.addEventListener('input',()=>{state.ready=false;render();});
document.querySelectorAll('button[data-action]').forEach(button=>button.addEventListener('click',async()=>{
  pending=true;render();
  try {const reply=await window.assistant.act(button.dataset.action,term.value);if(reply?.error)status.textContent=reply.error;}
  catch {status.textContent='操作失败，请重新检查学校页面。';}
  finally {pending=false;render();}
}));
