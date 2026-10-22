(() => {
  const form=document.getElementById('scheduleForm'),select=document.getElementById('scheduleCourse');
  const open=document.getElementById('scheduleOpen'),close=document.getElementById('scheduleClose'),message=document.getElementById('scheduleMessage');
  let courses=[],loading=false,loadedAt=0;
  const local=value=>{if(!value)return '';const date=new Date(Date.parse(value)+7*3600000);return date.toISOString().slice(0,16);};
  function selected(){return courses.find(c=>c.id===select.value);}
  function fill(){const c=selected();if(c){open.value=local(c.opensAt);close.value=local(c.closesAt);message.textContent='Trạng thái: '+({OPEN:'Đang mở',UPCOMING:'Chưa đến giờ',CLOSED:'Đã đóng',DISABLED:'Tạm khóa',INVALID:'Lịch không hợp lệ'}[c.windowStatus]||c.windowStatus);}}
  window.refreshCourseWindows=async(force=false)=>{
    if(!adminToken||loading||(!force&&Date.now()-loadedAt<60000))return;
    loading=true;
    try{const previous=select.value;const data=await callApi('listCourseWindows',{adminToken});courses=data.courses||[];
      select.replaceChildren(...courses.map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.title;return option;}));
      if(courses.some(c=>c.id===previous))select.value=previous;loadedAt=Date.now();fill();
    }catch(e){message.textContent=e.message;}finally{loading=false;}
  };
  select.addEventListener('change',fill);
  document.getElementById('schedulePanel').addEventListener('toggle',()=>window.refreshCourseWindows(true));
  form.addEventListener('submit',async event=>{
    event.preventDefault();const course=selected();if(!course)return;
    const button=document.getElementById('scheduleSave');button.disabled=true;
    try{
      const opensAt=open.value?open.value+':00+07:00':'',closesAt=close.value?close.value+':00+07:00':'';
      if(opensAt&&closesAt&&Date.parse(opensAt)>=Date.parse(closesAt))throw Error('Giờ đóng phải sau giờ mở.');
      await callApi('updateCourseWindow',{adminToken,courseId:course.id,opensAt,closesAt,expectedUpdatedAt:course.updatedAt||''});
      await window.refreshCourseWindows(true);message.textContent='Đã lưu lịch. Thời gian được kiểm tra tại máy chủ.';
    }catch(e){message.textContent=e.message;}finally{button.disabled=false;}
  });
  const otpButton=document.getElementById('adminOtpSend');
  otpButton.addEventListener('click',async()=>{
    if(!adminEmail.checkValidity()){adminEmail.reportValidity();return;}otpButton.disabled=true;
    try{const d=await callApi('sendAdminOtp',{email:adminEmail.value.trim()});loginMessage.textContent=d.message;
      let left=60;otpButton.textContent=`Gửi lại sau ${left}s`;const timer=setInterval(()=>{left--;otpButton.textContent=left?`Gửi lại sau ${left}s`:'Gửi OTP quản trị';if(!left){clearInterval(timer);otpButton.disabled=false;}},1000);
    }catch(e){loginMessage.textContent=e.message;otpButton.disabled=false;}
  });
})();
