export async function request(path,body){
 const options={credentials:'same-origin',headers:{Accept:'application/json'}};
 if(body!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
 const response=await fetch(path,options);let data;try{data=await response.json();}catch{throw Error('Сервер временно недоступен. Обновите страницу позже.');}
 if(!response.ok)throw Error(data.error||'Не удалось выполнить запрос.');return data;
}
export async function ensureSession(){return request('/api/session',{});}
