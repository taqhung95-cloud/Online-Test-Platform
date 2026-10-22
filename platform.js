/* Shared POST transport. The server origin is public; sessions and answers are not URL parameters. */
window.Portal = (() => {
  const sessionKey='sungrow_learner_session_v2';
  let token=sessionStorage.getItem(sessionKey)||localStorage.getItem(sessionKey)||'';
  let revision=0;
  const logoutKey='sungrow_learner_logout_v1';
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function session(value,remember=false){if(value!==undefined){revision++;token=value||'';localStorage.removeItem(sessionKey);if(token){sessionStorage.setItem(sessionKey,token);if(remember)localStorage.setItem(sessionKey,token);}else{sessionStorage.removeItem(sessionKey);localStorage.setItem(logoutKey,crypto.randomUUID());}}return token;}
  function showView(id){for(const name of ['bootView','loginView','courseView','examView','resultView','dashboardView']){const el=document.getElementById(name);if(el)el.hidden=name!==id;}}
  function loading(message='Đang kiểm tra phiên đăng nhập…'){
    showView('bootView');const label=document.getElementById('bootMessage'),retry=document.getElementById('bootRetry');
    document.getElementById('bootView')?.setAttribute('aria-busy','true');
    if(label)label.textContent=message;if(retry)retry.hidden=true;
  }
  function recovery(message,retryAction){loading(message);document.getElementById('bootView')?.setAttribute('aria-busy','false');const retry=document.getElementById('bootRetry');if(retry){retry.hidden=false;retry.onclick=retryAction;}}
  function isAuthError(error){return !error?.isTransportError && (/^(AUTH_EXPIRED|AUTH_REVOKED)$/.test(error?.code||'')||/Phiên (đăng nhập|quản trị) (đã hết hạn|không hợp lệ)|Tài khoản (đã bị khóa|bị khóa hoặc phiên)|Quyền quản trị đã bị thu hồi|^Vui lòng đăng nhập lại[.!]?$/.test(error?.message||''));}
  function once(endpoint,action,payload,timeoutMs=35000){
    return new Promise((resolve,reject)=>{
      const requestId=crypto.randomUUID(),frame=document.createElement('iframe'),form=document.createElement('form');
      const requestRevision=revision;
      frame.name='portal_'+requestId;frame.hidden=true;frame.title='Kết nối bảo mật';
      form.method='POST';form.action=endpoint;form.target=frame.name;form.hidden=true;
      const body={...payload,sessionToken:payload.sessionToken||token,clientOrigin:location.origin};
      for(const [name,value] of Object.entries({action,payload:JSON.stringify(body),transport:'iframe',requestId})){
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
      }
      const timer=setTimeout(()=>fail(Object.assign(new Error(action==='startAttempt'?'Chưa nhận được xác nhận tạo đề. Yêu cầu có thể vẫn đang xử lý; bấm Kiểm tra lại yêu cầu để nhận đúng lượt cũ.':'Máy chủ chưa xác nhận. Bài làm vẫn được giữ trên thiết bị.'),{isTransportError:true,uncertain:true})),timeoutMs);
      function cleanup(){clearTimeout(timer);window.removeEventListener('message',receive);form.remove();frame.remove();}
      function fail(error){cleanup();reject(error);}
      function receive(event){
        // Apps Script wraps HtmlService in a sandbox iframe. Validate its Google
        // origin and an unguessable request correlation ID, rather than using '*'.
        let origin;try{origin=new URL(event.origin);}catch{return;}
        if(origin.protocol!=='https:' || !(origin.hostname==='script.google.com'||/^([a-z0-9-]+[.-])?script\.googleusercontent\.com$/.test(origin.hostname)))return;
        const m=event.data;if(!m||m.source!=='MGRL_APPS_SCRIPT'||m.requestId!==requestId)return;
        cleanup();const data=m.data;
        if(!data?.ok){reject(Object.assign(new Error(data?.message||'Yêu cầu chưa hoàn tất.'),{isTransportError:!!data?.retryable,code:data?.code}));return;}
        if(data.sessionToken&&requestRevision!==revision){reject(Object.assign(new Error('Yêu cầu đăng nhập cũ đã bị hủy.'),{code:'STALE_AUTH'}));return;}
        if(data.sessionToken)session(data.sessionToken,data.remember===true);
        document.dispatchEvent(new CustomEvent('portal:connection',{detail:'online'}));resolve(data);
      }
      window.addEventListener('message',receive);document.body.append(frame,form);form.submit();
    });
  }
  async function request(endpoint,action,payload={}){
    // Preserve the answer snapshot across every retry of a single request.
    const stable=JSON.parse(JSON.stringify(payload));
    const interactive=['startAttempt','resumeAttempt','listCourses','getAdminDashboard'].includes(action);
    const retry=interactive?2:['submitAttempt','saveAttemptProgress'].includes(action)?6:1;
    const deadline=interactive?Date.now()+45000:Infinity;
    if(action==='submitAttempt')await pause(Math.random()*1800);
    for(let attempt=0;attempt<retry;attempt++){
      try{return await once(endpoint,action,stable,Math.min(35000,Math.max(1,deadline-Date.now())));}catch(e){
        document.dispatchEvent(new CustomEvent('portal:connection',{detail:'retry'}));
        if(!e.isTransportError||attempt===retry-1||interactive&&(e.uncertain||Date.now()+2000>=deadline))throw e;
        await pause(Math.min(16000,800*2**attempt)+Math.random()*1800);
      }
    }
  }
  document.addEventListener('portal:connection',event=>{const el=document.getElementById('connectionStatus');if(el){el.textContent=event.detail==='online'?'Đã kết nối':'Đang kết nối lại…';el.dataset.status=event.detail;}});
  window.addEventListener('offline',()=>{const el=document.getElementById('connectionStatus');if(el){el.textContent='Mất mạng · Bài làm lưu trên máy';el.dataset.status='retry';}});
  window.addEventListener('storage',event=>{
    if(event.key===logoutKey||event.key===sessionKey&&event.newValue&&token&&event.newValue!==token){
      revision++;token='';sessionStorage.removeItem(sessionKey);
      document.dispatchEvent(new CustomEvent('portal:logout',{detail:{message:'Phiên đã đăng xuất hoặc thay đổi ở tab khác. Vui lòng đăng nhập lại.'}}));
    }
  });
  return {request,session,showView,loading,recovery,isAuthError};
})();
