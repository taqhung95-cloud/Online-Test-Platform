(() => {
  function mount(panel, request, currentEpoch) {
    const status = panel.querySelector('[role=status]');
    const refreshButton = panel.querySelector('[data-refresh-enrollments]');
    const list = panel.querySelector('[data-enrollment-requests]');
    const bulk = panel.querySelector('[data-enrollment-bulk]');
    const selectAll = bulk.querySelector('input');
    const approveSelected = bulk.querySelector('button');
    const formatDate = new Intl.DateTimeFormat('vi-VN', {
      dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'
    });
    let busy = false;
    const entries = new Map();

    function syncControls() {
      const eligible = [...entries.values()].filter(entry => entry.row.canApprove);
      const selected = eligible.filter(entry => entry.checkbox.checked).length;
      bulk.hidden = !eligible.length;
      selectAll.checked = selected > 0 && selected === eligible.length;
      selectAll.indeterminate = selected > 0 && selected < eligible.length;
      selectAll.disabled = busy;
      approveSelected.disabled = busy || selected === 0;
      approveSelected.textContent = busy ? 'Đang xử lý…' : selected ? `Duyệt đã chọn (${selected})` : 'Duyệt đã chọn';
      refreshButton.disabled = busy;
      for (const {row,checkbox,approve,reject} of entries.values()) {
        checkbox.disabled = busy || !row.canApprove;
        approve.disabled = busy || !row.canApprove;
        reject.disabled = busy;
      }
    }

    function render(rows) {
      entries.clear();
      list.replaceChildren();
      for (const row of rows) {
        const item = document.createElement('li');
        item.className = 'learning-row enrollment-review-row';
        const identity = document.createElement('div');
        identity.className = 'enrollment-review-identity';
        const choice = document.createElement('label');
        choice.className = 'enrollment-review-choice';
        choice.hidden = !row.canApprove;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('aria-label',['Chọn yêu cầu',row.courseTitle,row.email || row.name].filter(Boolean).join(' · '));
        checkbox.onchange = syncControls;
        choice.append(checkbox);
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
          button.onclick = () => review([item],decision);
          actions.append(button);
        }
        if (!row.canApprove) {
          const reason = document.createElement('small');
          reason.textContent = 'Cần tài khoản đang hoạt động và khóa học đã xuất bản để duyệt.';
          identity.append(reason);
        }
        const message = document.createElement('small');
        message.className = 'enrollment-review-error';
        identity.append(message);
        const [approve,reject] = actions.children;
        entries.set(item,{row,checkbox,approve,reject,message});
        item.append(choice,identity,actions);
        list.append(item);
      }
    }

    async function refresh() {
      if (busy) return;
      const epoch = currentEpoch();
      busy = true;
      syncControls();
      status.textContent = 'Đang tải yêu cầu…';
      try {
        const {requests} = await request('adminLearningEnrollments');
        if (epoch !== currentEpoch()) return;
        render(requests);
        status.textContent = requests.length ? requests.length + ' yêu cầu chờ duyệt.' : 'Không có yêu cầu chờ duyệt.';
      } catch (error) {
        if (epoch === currentEpoch()) status.textContent = error.message;
      } finally {
        if (epoch === currentEpoch()) {
          busy = false;
          syncControls();
        }
      }
    }

    async function review(items,decision) {
      if (busy || !items.length) return;
      const epoch = currentEpoch();
      const restoreFocus = panel.contains(document.activeElement);
      busy = true;
      syncControls();
      status.textContent = 'Đang lưu quyết định…';
      let saved = 0;
      try {
        for (const item of items) {
          const {row,message} = entries.get(item);
          const {accountId,learningId,requestedAt} = row;
          message.textContent = '';
          try {
            await request('reviewLearningEnrollment',{accountId,learningId,requestedAt,decision});
            if (epoch !== currentEpoch()) return;
            saved++;
            entries.delete(item);
            item.remove();
          } catch (error) {
            if (epoch !== currentEpoch()) return;
            message.textContent = error.message || 'Chưa lưu được quyết định.';
          }
        }
        const failed = items.length - saved;
        const outcome = decision === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối';
        status.textContent = `${outcome} ${saved}/${items.length} yêu cầu.`
          + (failed ? ` ${failed} yêu cầu chưa xử lý được.` : entries.size ? '' : ' Không còn yêu cầu chờ duyệt.');
      } finally {
        if (epoch === currentEpoch()) {
          busy = false;
          syncControls();
          if (restoreFocus && !panel.hidden && document.activeElement === document.body) {
            const target = approveSelected.disabled ? list.querySelector('button:not(:disabled)') || refreshButton : approveSelected;
            target.focus();
          }
        }
      }
    }

    refreshButton.onclick = refresh;
    selectAll.onchange = () => {
      for (const {row,checkbox} of entries.values()) {
        if (row.canApprove) checkbox.checked = selectAll.checked;
      }
      syncControls();
    };
    approveSelected.onclick = () => review([...entries].filter(([,entry]) => entry.checkbox.checked)
      .map(([item]) => item),'APPROVED');
    return {refresh,clear() {
      busy = false;
      render([]);
      syncControls();
      status.textContent = '';
    }};
  }
  window.LearningEnrollmentReview = {mount};
})();
