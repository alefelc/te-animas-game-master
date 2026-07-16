export interface GameMasterOptions { timeoutMs?: number; retries?: number; baseDelayMs?: number; }
export interface GameMasterResult<T> { data: T | null; source: 'ai' | 'temporary-local'; error?: string; }
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

export async function requestGameMaster<T>(url: string, payload: unknown, localFallback: () => T, options: GameMasterOptions = {}): Promise<GameMasterResult<T>> {
  const timeoutMs=Math.max(1000,options.timeoutMs??10000);const retries=Math.max(0,options.retries??2);const base=Math.max(100,options.baseDelayMs??500);let last='';
  for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const text=await response.text();if(!response.ok)throw new Error(`${response.status}: ${text.slice(0,500)}`);
      const data=(text?JSON.parse(text):null) as T;return {data,source:'ai'};
    }catch(error){last=error instanceof Error?error.message:String(error);if(attempt<retries)await sleep(base*2**attempt);}finally{clearTimeout(timer);}
  }
  // No se cambia ni persiste el modo de la sesión. Solo esta carta usa fallback local.
  return {data:localFallback(),source:'temporary-local',error:last};
}
