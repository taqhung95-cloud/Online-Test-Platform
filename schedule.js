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
    const requestedToken=adminToken;
    try{const previous=select.value;const data=await callApi('listCourseWindows',{adminToken:requestedToken});if(adminToken!==requestedToken)return;courses=data.courses||[];
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
  document.getElementById('unlinkDeviceButton').addEventListener('click',async()=>{
    const email=window.prompt('Email tài khoản cần gỡ thiết bị (giữ nguyên lượt thi):');if(!email)return;
    if(!window.confirm('Thu hồi các phiên đăng nhập và gỡ liên kết thiết bị của '+email+'?'))return;
    try{const result=await callApi('unlinkParticipantDevice',{adminToken,email:email.trim()});message.textContent=result.message;}catch(error){message.textContent=error.message;}
  });
})();
