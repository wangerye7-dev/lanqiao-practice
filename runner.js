let pyodide;
const nativeFetch=self.fetch.bind(self);
const BOOT_CACHE='lanqiao-python-0.29.4-gzip-v1';
async function prepareRuntime(){
 const compressed=typeof DecompressionStream==='function';
 const specs=[
  {name:'pyodide.asm.wasm',size:8647684,transfer:compressed?2817747:8647684,gzip:compressed,mime:'application/wasm',sha:'10090fe41e019ae669d512e1f747021a8db2aaab0f6dd6f85fa9368c55d681e3'},
  {name:'python_stdlib.zip',size:2424002,transfer:2424002,mime:'application/zip',sha:'92cb24faa546818f3ef4050fd5bd2b6487bd2042efed2113af141d035f30efb4'}
 ];
 const total=specs.reduce((n,s)=>n+s.transfer,0),loaded=new Map();let last=0,cache;
 const progress=force=>{if(!force&&Date.now()-last<500)return;last=Date.now();const count=[...loaded.values()].reduce((a,b)=>a+b,0);postMessage({type:'boot-progress',message:`首次准备 Python：${Math.min(100,Math.floor(count/total*100))}% · ${(count/1e6).toFixed(1)}/${(total/1e6).toFixed(1)} MB`});};
 const valid=async(buffer,s)=>{if(buffer.byteLength!==s.size)return false;if(!self.crypto?.subtle)return true;const digest=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')===s.sha;};
 try{if(self.caches)cache=await caches.open(BOOT_CACHE);}catch{}
 const entries=await Promise.all(specs.map(async s=>{
  const url=new URL('runtime/'+s.name,self.location.href).href;
  if(cache){try{const cached=await cache.match(url);if(cached){const bytes=await cached.arrayBuffer();if(await valid(bytes,s)){loaded.set(s.name,s.transfer);progress(true);return [url,{bytes,mime:s.mime}];}await cache.delete(url);}}catch{}}
  const response=await nativeFetch(s.gzip?url+'.gz.bin':url);
  if(!response.ok)throw Error(`运行文件下载失败（${response.status}），请稍后重试。`);
  let bytes;
  if(response.body){const reader=response.body.getReader(),parts=[];let received=0;while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);received+=value.byteLength;loaded.set(s.name,Math.min(received,s.transfer));progress(false);}const all=new Uint8Array(received);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.byteLength;}bytes=all.buffer;}
  else bytes=await response.arrayBuffer();
  if(s.gzip)bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(!await valid(bytes,s))throw Error('运行文件没有完整下载，请点击重试。');
  loaded.set(s.name,s.transfer);progress(true);
  if(cache){try{await cache.put(url,new Response(bytes,{headers:{'Content-Type':s.mime}}));}catch{}}
  return [url,{bytes,mime:s.mime}];
 }));
 return new Map(entries);
}
const BOOTSTRAP = String.raw`
import sys, io, json, traceback, contextlib
class _LimitedOutput(io.StringIO):
    def write(self, text):
        if self.tell() + len(text) > 20000:
            raise RuntimeError('输出太多，请检查是否在循环里反复打印。')
        return super().write(text)
def _single(code, data):
    output, errors = _LimitedOutput(), _LimitedOutput()
    old_stdin = sys.stdin
    sys.stdin = io.StringIO(data)
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            exec(compile(code, '<练习>', 'exec'), {'__name__': '__main__'})
        return {'ok': True, 'output': output.getvalue(), 'stderr': errors.getvalue()}
    except BaseException as error:
        line = getattr(error, 'lineno', None)
        if line is None:
            for frame in traceback.extract_tb(error.__traceback__):
                if frame.filename == '<练习>': line = frame.lineno
        return {'ok': False, 'output': output.getvalue(), 'error': type(error).__name__, 'message': str(error), 'line': line, 'trace': traceback.format_exc()[-2400:]}
    finally:
        sys.stdin = old_stdin
def _execute(payload):
    data = json.loads(payload)
    if data['mode'] == 'run':
        return json.dumps(_single(data['code'], data.get('input', '')), ensure_ascii=False)
    passed = 0
    for i, case in enumerate(data['tests']):
        result = _single(data['code'], case['input'])
        if not result['ok'] or result['output'].split() != case['output'].split():
            return json.dumps({'ok': result['ok'], 'passed': passed, 'total': len(data['tests']), 'failed': i+1, 'input': case['input'][:2000], 'expected': case['output'][:2000], **result}, ensure_ascii=False)
        passed += 1
    return json.dumps({'ok': True, 'passed': passed, 'total': len(data['tests'])}, ensure_ascii=False)
`;
async function init(){
 try{
  postMessage({type:'boot-progress',message:'正在准备 Python；首次需要下载运行文件…'});
  importScripts('runtime/pyodide.js');
  const assets=await prepareRuntime();
  postMessage({type:'boot-progress',message:'运行文件已就绪，正在启动 Python…'});
  self.fetch=(input,options)=>{const url=typeof input==='string'?input:input.url||String(input);const asset=assets.get(url);return asset?Promise.resolve(new Response(asset.bytes,{headers:{'Content-Type':asset.mime}})):nativeFetch(input,options);};
  try{pyodide=await loadPyodide({indexURL:new URL('runtime/',self.location.href).href,stdout:()=>{},stderr:()=>{}});}finally{self.fetch=nativeFetch;assets.clear();}
  await pyodide.runPythonAsync(BOOTSTRAP);
  postMessage({type:'ready',version:pyodide.runPython('sys.version.split()[0]')});
 }catch(e){postMessage({type:'boot-error',message:String(e)});}
}
self.onmessage=async({data})=>{
 if(!pyodide){postMessage({type:'result',id:data.id,result:{ok:false,error:'RuntimeNotReady',message:'Python 还未准备好，请稍等。'}});return;}
 try{
  pyodide.globals.set('_PAYLOAD',JSON.stringify(data));
  const result=JSON.parse(await pyodide.runPythonAsync('_execute(_PAYLOAD)'));
  pyodide.globals.delete('_PAYLOAD');
  postMessage({type:'result',id:data.id,result});
 }catch(e){postMessage({type:'result',id:data.id,result:{ok:false,error:'RuntimeError',message:String(e)}});}
};
init();
