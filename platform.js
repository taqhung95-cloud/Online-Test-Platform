/* Shared POST transport. The server origin is public; sessions and answers are not URL parameters. */
window.Portal = (() => {
  const sessionKey='sungrow_learner_session_v2';
  let token=sessionStorage.getItem(sessionKey)||localStorage.getItem(sessionKey)||'';
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function session(value,remember=false){if(value!==undefined){token=value||'';localStorage.removeItem(sessionKey);if(token){sessionStorage.setItem(sessionKey,token);if(remember)localStorage.setItem(sessionKey,token);}else sessionStorage.removeItem(sessionKey);}return token;}
  function once(endpoint,action,payload){
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID(),frame=document.createElement('iframe'),form=document.createElement('form');
      frame.name='portal_'+requestId;frame.hidden=true;frame.title='Kết nối bảo mật';
      form.method='POST';form.action=endpoint;form.target=frame.name;form.hidden=true;
      const body={...payload,sessionToken:payload.sessionToken||token,clientOrigin:location.origin};
      for(const [name,value] of Object.entries({action,payload:JSON.stringify(body),transport:'iframe',requestId})){
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
      }
      const timer=setTimeout(()=>fail(Object.assign(new Error('Máy chủ chưa xác nhận. Bài làm vẫn được giữ trên thiết bị.'),{isTransportError:true})),35000);
      function cleanup(){clearTimeout(timer);window.removeEventListener('message',receive);form.remove();frame.remove();}
      function fail(error){cleanup();reject(error);}
      function receive(event){
        // Apps Script wraps HtmlService in a sandbox iframe. Validate its Google
        // origin and an unguessable request correlation ID, rather than using '*'.
        let origin;try{origin=new URL(event.origin);}catch{return;}
        if(origin.protocol!=='https:' || !(origin.hostname==='script.google.com'||/^([a-z0-9-]+[.-])?script\.googleusercontent\.com$/.test(origin.hostname)))return;
        const m=event.data;if(!m||m.source!=='MGRL_APPS_SCRIPT'||m.requestId!==requestId)return;
        cleanup();const data=m.data;
        if(!data?.ok){reject(Object.assign(new Error(data?.message||'Yêu cầu chưa hoàn tất.'),{isTransportError:!!data?.retryable}));return;}
        if(data.sessionToken)session(data.sessionToken,data.remember===true);
        document.dispatchEvent(new CustomEvent('portal:connection',{detail:'online'}));resolve(data);
      }
      window.addEventListener('message',receive);document.body.append(frame,form);form.submit();
    });
  }
  async function request(endpoint,action,payload={}){
    // Preserve the answer snapshot across every retry of a single request.
    const stable=JSON.parse(JSON.stringify(payload));
    const retry=['submitAttempt','startAttempt','saveAttemptProgress','resumeAttempt','listCourses','getAdminDashboard'].includes(action)?6:1;
    if(action==='submitAttempt')await pause(Math.random()*1800);
    for(let attempt=0;attempt<retry;attempt++){
      try{return await once(endpoint,action,stable);}catch(e){
        document.dispatchEvent(new CustomEvent('portal:connection',{detail:'retry'}));
        if(!e.isTransportError||attempt===retry-1)throw e;
        await pause(Math.min(16000,800*2**attempt)+Math.random()*1800);
      }
    }
  }
  document.addEventListener('portal:connection',event=>{const el=document.getElementById('connectionStatus');if(el){el.textContent=event.detail==='online'?'Đã kết nối':'Đang kết nối lại…';el.dataset.status=event.detail;}});
  window.addEventListener('offline',()=>{const el=document.getElementById('connectionStatus');if(el){el.textContent='Mất mạng · Bài làm lưu trên máy';el.dataset.status='retry';}});
  return {request,session};
})();
