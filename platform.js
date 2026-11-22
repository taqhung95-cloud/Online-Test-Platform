/* Shared POST transport. The server origin is public; sessions and answers are not URL parameters. */
window.Portal = (() => {
  const sessionKey='sungrow_learner_session_v2';
  let token=sessionStorage.getItem(sessionKey)||localStorage.getItem(sessionKey)||'';
  let revision=0;
  const logoutKey='sungrow_learner_logout_v1';
  const contentLoads = new WeakMap();
  function contentLoading(scope){
    contentLoads.set(scope,(contentLoads.get(scope)||0)+1);
    scope.setAttribute('data-portal-loading','');
    scope.setAttribute('aria-busy','true');
    let released=false;
    return ()=>{
      if(released)return;
      released=true;
      const count=contentLoads.get(scope)-1;
      if(count){contentLoads.set(scope,count);return;}
      contentLoads.delete(scope);
      scope.removeAttribute('data-portal-loading');
      scope.removeAttribute('aria-busy');
    };
  }
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
      const body={...payload,clientOrigin:location.origin};
      for(const [name,value] of Object.entries({action,payload:JSON.stringify(body),transport:'iframe',requestId})){
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
      }
      const timeoutMessage=action==='startAttempt'
        ? 'Chưa nhận được xác nhận tạo đề. Yêu cầu có thể vẫn đang xử lý; bấm Kiểm tra lại yêu cầu để nhận đúng lượt cũ.'
        : ['adminBeginLessonUpload','adminUploadLessonChunk'].includes(action)
          ? 'Chưa nhận được xác nhận tải tài liệu từ Drive.'
          : ['submitAttempt','saveAttemptProgress'].includes(action)
            ? 'Máy chủ chưa xác nhận. Bài làm vẫn được giữ trên thiết bị.'
            : 'Máy chủ chưa phản hồi. Vui lòng thử lại.';
      const timedOut=()=>fail(Object.assign(new Error(timeoutMessage),{isTransportError:true,uncertain:true}));
      const timer=setTimeout(timedOut,timeoutMs);
      let responseTimer;
      if(retryableRequest(action,payload)){
        frame.onload=()=>{
          try{if(frame.contentWindow.location.href==='about:blank')return;}catch{/* Google response is cross-origin. */}
          if(!responseTimer)responseTimer=setTimeout(timedOut,6000);
        };
      }
      function cleanup(){clearTimeout(timer);clearTimeout(responseTimer);frame.onload=null;window.removeEventListener('message',receive);form.remove();frame.remove();}
      function fail(error){cleanup();reject(error);}
      function receive(event){
        // Apps Script wraps HtmlService in a sandbox iframe. Validate its Google
        // origin and an unguessable request correlation ID, rather than using '*'.
        let origin;try{origin=new URL(event.origin);}catch{return;}
        if(origin.protocol!=='https:' || !(origin.hostname==='script.google.com'||/^([a-z0-9-]+[.-])?script\.googleusercontent\.com$/.test(origin.hostname)))return;
        const m=event.data;if(!m||m.source!=='MGRL_APPS_SCRIPT'||m.requestId!==requestId)return;
        cleanup();const data=m.data;
        if(requestRevision!==revision){reject(staleRequest());return;}
        if(!data?.ok){reject(Object.assign(new Error(data?.message||'Yêu cầu chưa hoàn tất.'),{isTransportError:!!data?.retryable,code:data?.code,receiptTicket:data?.receiptTicket}));return;}
        if(data.sessionToken)session(data.sessionToken,data.remember===true);
        document.dispatchEvent(new CustomEvent('portal:connection',{detail:'online'}));resolve(data);
      }
      window.addEventListener('message',receive);document.body.append(frame,form);form.submit();
    });
  }
  const staleRequest=()=>Object.assign(new Error('Phiên đã thay đổi trong lúc chờ phản hồi.'),{code:'STALE_AUTH'});
  const isLogin=(action,payload)=>action==='loginParticipant'||action==='loginAdmin'&&payload.portalLogin===true;
  function retryableRequest(action,payload){
    return isLogin(action,payload)||action==='startAttempt'&&!!payload.startRequestId||
      ['resumeAttempt','listCourses','learningHome','getLearningPlayback','completeLearningLesson','requestLearningEnrollment','getLatestResult','getAttemptResult','submitAttempt','saveAttemptProgress'].includes(action);
  }
  async function request(endpoint,action,payload={},onReceipt){
    const stable=JSON.parse(JSON.stringify({...payload,sessionToken:payload.sessionToken||token}));
    const requestRevision=revision;
    const login=isLogin(action,stable);
    if(login)stable.loginRequestId=crypto.randomUUID();
    const canRetry=retryableRequest(action,stable);
    const tries=canRetry?7:action==='getAdminDashboard'?2:1;
    const deadline=canRetry?Date.now()+105000:Infinity;
    const timeout=action==='adminUploadLessonChunk'&&stable.data?90000:
      ['adminBeginLessonUpload','adminUploadLessonChunk'].includes(action)?60000:35000;
    if(login||action==='startAttempt'||action==='learningHome'){
      await pause(Math.random()*(login?2600:action==='startAttempt'?2200:900));
    }
    for(let attempt=0;attempt<tries;attempt++){
      if(requestRevision!==revision)throw staleRequest();
      try{return await once(endpoint,action,stable,Math.min(timeout,Math.max(1,deadline-Date.now())));}catch(e){
        if(e.code==='STALE_AUTH'||!e.isTransportError)throw e;
        document.dispatchEvent(new CustomEvent('portal:connection',{detail:'retry'}));
        if(e.receiptTicket){
          stable.receiptTicket=e.receiptTicket;
          onReceipt?.(e.receiptTicket);
        }
        if(stable.receiptTicket)e.receiptTicket=stable.receiptTicket;
        const backoff=450+Math.random()*Math.min(12000,1600*2**attempt);
        if(attempt===tries-1||e.uncertain&&!canRetry||Date.now()+backoff+3000>=deadline)throw e;
        await pause(backoff);
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
  return {request,session,showView,loading,contentLoading,recovery,isAuthError};
})();
