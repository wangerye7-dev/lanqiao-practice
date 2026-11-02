'use strict';
const $=id=>document.getElementById(id);
const KEY='lanqiao-beginner-v2';
let lessons=[],current=null,state={version:2,last:'S01',items:{}},worker,ready=false,busy=false,job=0,jobTimer,bootTimer,bootDeadline,reviewOnly=false,saveTimer,undoStack=[];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function store(){try{localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='已保存到本机';}catch(e){$('storageWarning').hidden=false;$('storageWarning').textContent='当前浏览器无法保存进度。请用“备份进度”保存，关闭页面前不要清理数据。';$('saveStatus').textContent='未能自动保存';}}
function entry(){return state.items[current.id]??(state.items[current.id]={code:current.starter,input:current.samples[0]?.input||'',hint:0,solution:false,assisted:false,passed:false,independent:false});}
function saveDraft(){if(!current)return;const e=entry();e.code=$('editor').value;e.input=$('stdin').value;e.updated=Date.now();store();}
function isDue(e){return !!e?.passed&&Number.isFinite(e.reviewAt)&&e.reviewAt<=Date.now();}
function nav(){
 const passed=Object.values(state.items).filter(e=>e.passed).length;
 const independent=Object.values(state.items).filter(e=>e.independent).length;
 $('progressNumber').textContent=passed;$('progressBar').value=passed;$('progressBar').max=lessons.length;
 $('progressNote').textContent=passed?`${independent} 道独立通过 · ${passed-independent} 道提示后通过`:'先从 10 个短课开始，每次学一点。';
 $('reviewCount').textContent=Object.values(state.items).filter(isDue).length;
 const query=$('search').value.trim().toLowerCase();let group='',content='';
 for(const p of lessons){
  if(reviewOnly&&!isDue(state.items[p.id]))continue;
  if(query&&!`${p.id} ${p.title} ${p.module}`.toLowerCase().includes(query))continue;
  if(p.module!==group){if(group)content+='</div>';content+=`<div class="nav-group"><h3>${esc(p.module)}</h3>`;group=p.module;}
  const e=state.items[p.id];
  content+=`<button class="lesson-link ${p.id===current?.id?'active':''}" data-id="${p.id}" ${p.id===current?.id?'aria-current="step"':''}><span class="nav-id">${p.id}</span><span class="nav-title">${esc(p.title)}</span><span class="nav-check" aria-label="${e?.passed?'已通过':'未通过'}">${e?.passed?'✓':''}</span></button>`;
 }
 if(group)content+='</div>';
 $('courseNav').innerHTML=content||'<p class="muted">这里暂时没有题目。完成后会安排 2 天后的复做。</p>';
}
function lines(){const t=$('editor');$('lineNumbers').textContent=Array.from({length:t.value.split('\n').length},(_,i)=>i+1).join('\n');$('lineNumbers').scrollTop=t.scrollTop;}
function tab(code){document.body.classList.toggle('code-active',code);$('learnTab').setAttribute('aria-selected',String(!code));$('codeTab').setAttribute('aria-selected',String(code));}
function closeMenu(){$('sidebar').classList.remove('open');$('overlay').hidden=true;$('menuToggle').setAttribute('aria-expanded','false');}
function lessonStatus(){const e=entry();$('lessonStatus').textContent=e.independent?'独立通过':e.passed?'提示后通过':e.code!==current.starter?'练习中':'未开始';$('lessonStatus').classList.toggle('done',!!e.passed);}
function clearResult(){document.querySelector('.result-area').className='result-area';$('resultTitle').textContent='准备好，就运行一次';$('resultMessage').textContent='先把代码写出来。运行看看显示当前输入的结果；检查答案会自动换几组数据。';$('resultBadge').textContent='';$('resultOutput').hidden=true;$('diff').hidden=true;$('passActions').hidden=true;}
function showHints(){const e=entry();$('hints').innerHTML=current.hints.slice(0,e.hint).map(h=>`<li>${esc(h)}</li>`).join('');$('hintBtn').disabled=e.hint>=current.hints.length;$('hintBtn').textContent=e.hint>=current.hints.length?'提示已看完':e.hint?'再给一个提示':'给我一个提示';$('solution').hidden=!e.solution;$('solutionBtn').textContent=e.solution?'收起解析':'查看解析与参考写法';}
function select(id,{scroll=true}={}){
 if(busy){notify('程序正在运行，请等待完成或先点“停止”。');return;}
 const p=lessons.find(x=>x.id===id);if(!p)return;if(current)saveDraft();current=p;
 state.last=id;const e=entry();$('lessonTitle').textContent=`${p.id} ${p.title}`;$('breadcrumbs').textContent=p.module+' / '+p.level;
 $('lessonMeta').textContent=id.startsWith('S')?'读懂一个小知识点，再动手改几行。':'原创训练题 · 先手算样例，再独立完成';
 $('concept').textContent=p.concept;$('minutes').textContent=`约 ${p.minutes} 分钟`;
 $('learnText').innerHTML=p.learn.map(s=>`<p>${esc(s)}</p>`).join('');$('exampleCode').textContent=p.example;$('statement').textContent=p.statement;
 $('inputFormat').textContent=p.input;$('outputFormat').textContent=p.output;$('limits').textContent=p.limits;$('ioDetails').hidden=id.startsWith('S');
 $('samples').innerHTML=p.samples.map((s,i)=>`<div class="sample-row"><div><span>样例 ${i+1} 输入</span><pre>${esc(s.input.trimEnd()||'（无需输入）')}</pre></div><div><span>样例 ${i+1} 输出</span><pre>${esc(s.output.trimEnd())}</pre></div></div>`).join('');
 $('editor').value=e.code??p.starter;$('stdin').value=e.input??p.samples[0]?.input??'';$('codeFilename').textContent=id+'.py';$('idea').textContent=p.idea;$('pitfall').textContent='注意：'+p.pitfall;$('referenceCode').textContent=p.code;
 undoStack=[];lines();lessonStatus();showHints();clearResult();nav();store();closeMenu();
 history.replaceState(null,'','#'+id);if(scroll)window.scrollTo({top:0,behavior:'smooth'});tab(false);
}
function setBusy(value){busy=value;$('runBtn').disabled=value||!ready;$('checkBtn').disabled=value||!ready;$('stopBtn').hidden=!value;$('editor').readOnly=value;$('stdin').readOnly=value;for(const id of ['resetBtn','hintBtn','solutionBtn','loadSolutionBtn','sampleBtn','undoBtn'])$(id).disabled=value;for(const b of document.querySelectorAll('[data-insert]'))b.disabled=value;if(!value&&current)showHints();}
function runtime(text,cls=''){$('runtimeState').className='runtime-state '+cls;$('runtimeState').querySelector('span').textContent=text;}
function boot(){
 if(worker)worker.terminate();clearTimeout(bootTimer);clearTimeout(bootDeadline);ready=false;setBusy(false);runtime('正在准备 Python，首次下载后会保存在本机…');
 worker=new Worker('runner.js');
 const activeWorker=worker;
 const clearBoot=()=>{clearTimeout(bootTimer);clearTimeout(bootDeadline);};
 const timeout=()=>{if(worker!==activeWorker)return;clearBoot();activeWorker.terminate();ready=false;setBusy(false);runtime('网络较慢，点此重试；已下载的文件会保留','error');};
 const keepWaiting=()=>{clearTimeout(bootTimer);bootTimer=setTimeout(timeout,90000);};
 keepWaiting();bootDeadline=setTimeout(timeout,360000);
 worker.onmessage=({data})=>{
  if(worker!==activeWorker)return;
  if(data.type==='boot-progress'&&!ready){keepWaiting();runtime(data.message);}
  if(data.type==='ready'){clearBoot();ready=true;runtime('Python 已就绪','ready');setBusy(false);}
  if(data.type==='boot-error'){clearBoot();ready=false;runtime('加载失败，点此重试','error');console.warn(data.message);setBusy(false);}
  if(data.type==='result'&&data.id===job){clearTimeout(jobTimer);setBusy(false);renderResult(data.result,window._lastMode);}
 };
 worker.onerror=()=>{if(worker!==activeWorker)return;clearBoot();clearTimeout(jobTimer);ready=false;setBusy(false);runtime('运行环境出错，点此重试','error');};
}
function humanError(r){
 const where=r.line?`第 ${r.line} 行：`:'';
 const map={SyntaxError:'语法还差一点。看看英文括号、引号是否成对，if、for、def 后是否有冒号。',IndentationError:'缩进不一致。分支、循环或函数里的代码通常向右缩进 4 个空格。',TabError:'混用了制表符和空格。建议统一使用 4 个空格缩进。',NameError:'有个名字还没定义。检查变量拼写，以及使用前是否已经赋值。',TypeError:'数据类型不合适。特别检查 input() 得到的文字是否需要用 int(...) 转成整数。',ValueError:'输入内容无法按当前方式转换。检查输入框的格式和 int(...) 转换的内容。',EOFError:'程序读取的行数超过了输入框提供的行数。先恢复样例输入，并检查 input() 的数量。',IndexError:'下标超出了列表或字符串长度。第一个元素的下标是 0。',ZeroDivisionError:'除数变成了 0。检查除法和取余前的条件。',KeyError:'字典中没有这个键。可先检查键是否存在，或使用 get。',MemoryError:'这次运算需要的内存过多。先缩小数据，检查列表大小和循环。'};
 return where+(map[r.error]||'程序未能完成。根据下方报错，先检查对应行和输入数据。');
}
function renderResult(r,mode){
 const area=document.querySelector('.result-area');$('diff').hidden=true;$('passActions').hidden=true;$('resultOutput').hidden=true;$('resultBadge').textContent='';
 if(!r.ok){area.className='result-area error';$('resultTitle').textContent='这里需要改一下';$('resultMessage').textContent=humanError(r);$('resultOutput').textContent=`${r.error||'错误'}: ${r.message||''}`;$('resultOutput').hidden=false;if(mode==='check'&&r.input!==undefined){$('diff').hidden=false;$('failInput').textContent=r.input||'（无需输入）';$('expected').textContent=r.expected;$('actual').textContent=r.output||'（程序未产生输出）';}return;}
 if(mode==='run'){
  area.className='result-area';$('resultTitle').textContent='这是程序的运行结果';$('resultMessage').textContent='运行成功不代表答案一定正确。请再点“检查答案”，看看其他数据是否也能通过。';$('resultOutput').hidden=false;$('resultOutput').textContent=r.output||'（没有输出。需要显示结果时，请使用 print。）';return;
 }
 $('resultBadge').textContent=`${r.passed} / ${r.total} 组通过`;
 if(r.passed===r.total){
  const e=entry();e.passed=true;e.independent=!!e.independent||!e.assisted;e.passedAt=Date.now();e.reviewAt=Date.now()+2*86400000;store();lessonStatus();nav();
  area.className='result-area success';$('resultTitle').textContent=e.assisted?'通过了，再独立练一次会更稳':'通过了，这一步已经完成';$('resultMessage').textContent=e.assisted?'本次使用过提示或解析，已记为辅助完成。之后可点“重新练习”，关闭提示再写一次。':'这批练习数据全部通过。试着用自己的话解释这段代码，再继续下一题。';$('passActions').hidden=false;
  $('nextBtn').textContent=lessons.indexOf(current)===lessons.length-1?'回到入门课':'继续下一题 →';
 }else{
  area.className='result-area error';$('resultTitle').textContent='程序能运行，但结果还不对';$('resultMessage').textContent=`第 ${r.failed} 组数据没通过。先手算这组输入，比较预期结果和你的输出。检查遇到首个错误就停止，后面的数据尚未检查。`;$('diff').hidden=false;$('failInput').textContent=r.input||'（无需输入）';$('expected').textContent=r.expected;$('actual').textContent=r.output||'（没有输出）';
 }
}
function execute(mode){
 if(!ready||busy)return;const code=$('editor').value;if(!code.trim()){notify('先在编辑区写几行代码。');return;}if(code.length>20000){notify('本练习室每次最多运行 20000 个字符的代码。');return;}
 saveDraft();clearResult();setBusy(true);window._lastMode=mode;const id=++job;
 $('resultTitle').textContent=mode==='run'?'正在运行…':'正在检查答案…';$('resultMessage').textContent='可以点“停止”中断本次运行，已经写好的代码会保留。';
 worker.postMessage({id,mode,code,input:$('stdin').value,tests:mode==='check'?current.tests:undefined});
 jobTimer=setTimeout(()=>{if(!busy)return;job++;worker.terminate();ready=false;setBusy(false);$('resultTitle').textContent='运行时间较长，已停止';$('resultMessage').textContent='请检查循环是否会结束，或者算法是否需要减少重复计算。代码已保留；运行环境正在重新准备。';document.querySelector('.result-area').className='result-area error';boot();},15000);
}
function insert(text){const t=$('editor');if(busy)return;undoStack.push(t.value);const a=t.selectionStart,b=t.selectionEnd;t.setRangeText(text,a,b,'end');if(['()','""','[]'].includes(text))t.selectionStart=t.selectionEnd=a+1;t.focus();lines();saveDraft();}
function reset(){if(busy)return;if(!confirm('将当前编辑区恢复为起始代码，并清除本次提示记录。已通过的历史记录保留。继续吗？'))return;const e=entry();e.code=current.starter;e.input=current.samples[0]?.input||'';e.hint=0;e.solution=false;e.assisted=false;$('editor').value=e.code;$('stdin').value=e.input;undoStack=[];lines();showHints();clearResult();store();notify('已开始新的独立练习。');}
function normalizeImport(data){
 if(data.version!==2||!data.items||Array.isArray(data.items)||typeof data.items!=='object')throw Error('不是本练习室的进度文件。');
 const clean={version:2,last:lessons.some(p=>p.id===data.last)?data.last:'S01',items:{}};
 for(const p of lessons){const e=data.items[p.id];if(!e||typeof e!=='object')continue;if(typeof e.code!=='string'||e.code.length>20000)throw Error('代码字段不正确或过长。');clean.items[p.id]={code:e.code,input:typeof e.input==='string'?e.input.slice(0,200000):'',hint:Math.min(3,Math.max(0,Number(e.hint)||0)),solution:!!e.solution,assisted:!!e.assisted,passed:!!e.passed,independent:!!e.passed&&!!e.independent,reviewAt:Number.isFinite(e.reviewAt)?e.reviewAt:null,passedAt:Number.isFinite(e.passedAt)?e.passedAt:null};}
 return clean;
}
function bind(){
 $('courseNav').onclick=e=>{const b=e.target.closest('[data-id]');if(b)select(b.dataset.id);};
 $('home').onclick=e=>{e.preventDefault();select('S01');};
 $('menuToggle').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('overlay').hidden=!open;$('menuToggle').setAttribute('aria-expanded',String(open));};$('overlay').onclick=closeMenu;
 $('search').oninput=nav;$('allFilter').onclick=()=>{reviewOnly=false;$('allFilter').classList.add('active');$('reviewFilter').classList.remove('active');nav();};$('reviewFilter').onclick=()=>{reviewOnly=true;$('reviewFilter').classList.add('active');$('allFilter').classList.remove('active');nav();};
 $('learnTab').onclick=()=>tab(false);$('codeTab').onclick=()=>tab(true);$('goCode').onclick=()=>{tab(true);window.scrollTo({top:0,behavior:'smooth'});};
 $('editor').addEventListener('beforeinput',()=>{undoStack.push($('editor').value);if(undoStack.length>60)undoStack.shift();});
 $('editor').oninput=()=>{lines();$('saveStatus').textContent='保存中…';clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,300);lessonStatus();};$('editor').onscroll=()=>{$('lineNumbers').scrollTop=$('editor').scrollTop;};
 $('editor').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();insert('    ');}else if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey){const t=e.target;const before=t.value.slice(0,t.selectionStart);const last=before.split('\n').at(-1);const leading=last.match(/^\s*/)[0]+(last.trimEnd().endsWith(':')?'    ':'');e.preventDefault();insert('\n'+leading);}else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();execute('run');}};
 $('stdin').oninput=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,300);};
 document.querySelectorAll('[data-insert]').forEach(b=>{b.onpointerdown=e=>e.preventDefault();b.onclick=()=>insert(b.dataset.insert);});$('undoBtn').onclick=()=>{if(!undoStack.length)return;$('editor').value=undoStack.pop();lines();saveDraft();};
 $('sampleBtn').onclick=()=>{$('stdin').value=current.samples[0]?.input||'';saveDraft();};
 $('hintBtn').onclick=()=>{const e=entry();e.hint=Math.min(current.hints.length,e.hint+1);e.assisted=true;showHints();store();};
 $('solutionBtn').onclick=()=>{const e=entry();e.solution=!e.solution;if(e.solution)e.assisted=true;showHints();store();};
 $('loadSolutionBtn').onclick=()=>{if(!confirm('将用参考写法替换当前代码，本次记为辅助完成。继续吗？'))return;undoStack.push($('editor').value);$('editor').value=current.code;entry().assisted=true;lines();saveDraft();tab(true);};
 $('runBtn').onclick=()=>execute('run');$('checkBtn').onclick=()=>execute('check');
 $('stopBtn').onclick=()=>{job++;clearTimeout(jobTimer);worker.terminate();ready=false;setBusy(false);$('resultTitle').textContent='已停止，代码已保留';$('resultMessage').textContent='检查循环条件或数据量后再试。运行环境正在重新准备。';boot();};
 $('runtimeState').onclick=()=>{if(!ready&&!busy)boot();};$('resetBtn').onclick=reset;
 $('nextBtn').onclick=()=>select(lessons[(lessons.indexOf(current)+1)%lessons.length].id);
 $('exportBtn').onclick=()=>{saveDraft();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='蓝桥练习进度_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);notify('进度备份已导出。可在另一设备中导入。');};
 $('importBtn').onclick=()=>{if(busy){notify('请先停止运行。');return;}$('importFile').click();};
 $('importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>4e6)throw Error('文件过大。');const next=normalizeImport(JSON.parse(await file.text()));if(!confirm('导入会替换当前设备的练习进度。建议先备份。是否继续？'))return;state=next;current=null;store();select(state.last);notify('进度已导入。');}catch(err){notify('导入失败：'+err.message);}finally{e.target.value='';}};
 window.addEventListener('pagehide',saveDraft);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();});
 window.addEventListener('hashchange',()=>select(location.hash.slice(1)));
}
async function main(){
 try{const r=await fetch('content.json');if(!r.ok)throw Error('题目数据读取失败');lessons=await r.json();try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved)state=normalizeImport(saved);}catch(e){if(e instanceof SyntaxError){notify('原进度文件格式异常，已使用新的练习记录。');}}bind();const id=location.hash.slice(1)||state.last;select(lessons.some(p=>p.id===id)?id:'S01',{scroll:false});boot();if(['127.0.0.1','localhost'].includes(location.hostname))window.trainerQA={lessons,select,execute,getState:()=>state,getCurrent:()=>current,getReady:()=>ready,getBusy:()=>busy};}
 catch(e){$('lessonTitle').textContent='暂时无法载入课程';$('lessonMeta').textContent='请刷新页面重试。'+e.message;}
}
main();
