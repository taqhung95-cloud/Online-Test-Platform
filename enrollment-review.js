(() => {
  function mount(panel, request, currentEpoch) {
    const status = panel.querySelector('[role=status]');
    const refreshButton = panel.querySelector('[data-refresh-enrollments]');
    const list = panel.querySelector('[data-enrollment-requests]');
    const formatDate = new Intl.DateTimeFormat('vi-VN', {
      dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'
    });
    let busy = false;

    function render(rows) {
      list.replaceChildren();
      for (const row of rows) {
        const item = document.createElement('li');
        item.className = 'learning-row enrollment-review-row';
        const identity = document.createElement('div');
        const course = document.createElement('strong');
        course.textContent = row.courseTitle;
        const person = document.createElement('p');
        person.textContent = [row.name,row.email,row.company].filter(Boolean).join(' · ') || 'Tài khoản không còn trong danh sách';
        identity.append(course,person);
        if (row.requestedAt) {
          const date = document.createElement('time');
          date.dateTime = row.requestedAt;
          date.textContent = formatDate.format(new Date(row.requestedAt));
          identity.append(date);
        }
        const actions = document.createElement('div');
        actions.className = 'enrollment-review-actions';
        for (const [decision,label] of [['APPROVED','Duyệt'],['REJECTED','Từ chối']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = decision === 'APPROVED' ? 'button' : 'button secondary-button';
          button.textContent = label;
          button.setAttribute('aria-label',[label,row.courseTitle,row.email].filter(Boolean).join(' · '));
          button.disabled = decision === 'APPROVED' && !row.canApprove;
          button.onclick = () => review(row,decision,item,actions);
          actions.append(button);
        }
        if (!row.canApprove) {
          const reason = document.createElement('small');
          reason.textContent = 'Cần tài khoản đang hoạt động và khóa học đã xuất bản để duyệt.';
          identity.append(reason);
        }
        item.append(identity,actions);
        list.append(item);
      }
    }

    async function refresh() {
      if (busy) return;
      const epoch = currentEpoch();
      busy = refreshButton.disabled = true;
      list.replaceChildren();
      status.textContent = 'Đang tải yêu cầu…';
      try {
        const {requests} = await request('adminLearningEnrollments');
        if (epoch !== currentEpoch()) return;
        render(requests);
        status.textContent = requests.length ? requests.length + ' yêu cầu chờ duyệt.' : 'Không có yêu cầu chờ duyệt.';
      } catch (error) {
        if (epoch === currentEpoch()) status.textContent = error.message;
      } finally {
        if (epoch === currentEpoch()) busy = refreshButton.disabled = false;
      }
    }

    async function review(row,decision,item,actions) {
      if (busy) return;
      const epoch = currentEpoch();
      busy = refreshButton.disabled = true;
      const buttons = [...actions.querySelectorAll('button:not(:disabled)')];
      buttons.forEach(button => button.disabled = true);
      status.textContent = 'Đang lưu quyết định…';
      try {
        await request('reviewLearningEnrollment',{accountId:row.accountId,learningId:row.learningId,decision});
        if (epoch !== currentEpoch()) return;
        const next = item.nextElementSibling || item.previousElementSibling;
        item.remove();
        refreshButton.disabled = false;
        if (!panel.hidden) (next?.querySelector('button:not(:disabled)') || refreshButton).focus();
        const outcome = decision === 'APPROVED' ? 'Đã duyệt ' : 'Đã từ chối ';
        status.textContent = outcome + row.courseTitle + (row.email ? ' cho ' + row.email : '') + '.'
          + (list.children.length ? '' : ' Không còn yêu cầu chờ duyệt.');
      } catch (error) {
        if (epoch === currentEpoch()) status.textContent = error.message;
      } finally {
        if (epoch === currentEpoch()) {
          busy = refreshButton.disabled = false;
          buttons.forEach(button => button.disabled = false);
        }
      }
    }

    refreshButton.onclick = refresh;
    return {refresh,clear() {
      busy = refreshButton.disabled = false;
      list.replaceChildren();
      status.textContent = '';
    }};
  }
  window.LearningEnrollmentReview = {mount};
})();
