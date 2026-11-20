(() => {
  const learner = document.getElementById('learningPortal');
  const admin = document.getElementById('learningAdmin');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);

  function wireForm(form, run, status) {
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      status.textContent = 'Đang lưu…';
      try {
        await run(Object.fromEntries(new FormData(form)), form);
        status.textContent = 'Đã lưu.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }

  if (learner) {
    const navigation = document.getElementById('academyNavigation');
    const content = learner.querySelector('.learning-content');
    const status = learner.querySelector('[role=status]');
    const exams = document.getElementById('learningExams');
    let generation = 0;
    let active = 'overview';
    let home;
    let selectedCourse = '';
    function catalog(title, items, filterLabel, options, card) {
      content.innerHTML = `<h2>${title}</h2><div class="catalog-tools">
        <label>Tìm theo tên<input type="search" id="catalogSearch"></label>
        <label>${filterLabel}<select id="catalogFilter"><option value="">Tất cả</option>${options}</select></label>
        </div><p class="catalog-count" role="status"></p><div class="catalog-grid"></div>
        <nav class="catalog-pages" aria-label="Phân trang"></nav>`;
      const search = content.querySelector('#catalogSearch');
      const filter = content.querySelector('#catalogFilter');
      const grid = content.querySelector('.catalog-grid');
      const pages = content.querySelector('.catalog-pages');
      const pageSize = 12;
      function show(page = 0) {
        const query = search.value.trim().toLocaleLowerCase('vi');
        const matches = items.filter(item => item.title.toLocaleLowerCase('vi').includes(query) && (!filter.value || item.status === filter.value));
        const count = Math.ceil(matches.length / pageSize);
        grid.innerHTML = matches.slice(page * pageSize, (page + 1) * pageSize).map(card).join('');
        content.querySelector('.catalog-count').textContent = matches.length ? `${matches.length} mục` : 'Không có mục phù hợp.';
        pages.hidden = count <= 1;
        pages.innerHTML = count > 1 ? `<button class="button secondary-button" type="button" ${page ? '' : 'disabled'}>Trang trước</button><span>${page + 1} / ${count}</span><button class="button secondary-button" type="button" ${page + 1 < count ? '' : 'disabled'}>Trang sau</button>` : '';
        if (count > 1) {
          const [previous,next] = pages.querySelectorAll('button');
          previous.onclick = () => {show(page - 1); pages.querySelector('button:not(:disabled)')?.focus();};
          next.onclick = () => {show(page + 1); pages.querySelector('button:not(:disabled)')?.focus();};
        }
      }
      search.oninput = filter.onchange = () => show();
      show();
    }
    const request = (action, data = {}) => callApi(action, {...data, deviceId:state.deviceId});
    const history = items => items.length ? items.map(item => `
      <button class="learning-row" type="button" data-result="${escape(item.id)}">
        <span><strong>${escape(item.title)}</strong><small>${escape(item.submittedAt)}</small></span>
        <span>${escape(item.score)}/${escape(item.total)} · ${item.result === 'PASS' ? 'Đạt' : 'Chưa đạt'}</span>
      </button>`).join('') : '<p>Chưa có kết quả đã nộp.</p>';

    function render() {
      if (active === 'overview') {
        const completed = home.courses.flatMap(course => course.lessons).filter(lesson => lesson.completed).length;
        const upcoming = state.courses.filter(course => course.windowStatus === 'UPCOMING' || course.canStart)
          .sort((a,b) => (Date.parse(a.canStart ? a.closesAt : a.opensAt) || Infinity) -
            (Date.parse(b.canStart ? b.closesAt : b.opensAt) || Infinity)).slice(0, 3);
        const activeCourses = home.courses.filter(course => course.lessons.some(lesson => !lesson.completed)).slice(0, 3);
        content.innerHTML = `<div class="v2-overview">
          <aside class="v2-profile" aria-label="Hồ sơ học viên">
            <div class="v2-avatar" aria-hidden="true">${escape(home.profile.name?.trim().slice(0,1).toLocaleUpperCase('vi') || 'S')}</div>
            <h3>${escape(home.profile.name)}</h3><p>${escape(home.profile.company)}</p>
            <div class="v2-metrics">
              <div>${portalIcon('medal')}<strong>${home.awards.length}</strong>Huy hiệu</div>
              <div>${portalIcon('certificate')}<strong>${home.awards.length}</strong>Chứng nhận</div>
              <div>${portalIcon('progress')}<strong>${completed}</strong>Bài đã học</div>
              <div>${portalIcon('exam')}<strong>${home.history.length}</strong>Lượt thi</div>
            </div>
            <button type="button" class="button secondary-button" data-learning-tab="profile">Xem hồ sơ</button>
          </aside>
          <div class="v2-overview-banner">
            <div class="v2-banner"><span class="v2-eyebrow">Sungrow E-learning</span>
              <h2>Xin chào, ${escape(home.profile.name)}</h2>
              ${activeCourses.length ? `<p>${escape(activeCourses[0].title)}</p>
                <button class="button" type="button" data-learning-course="${escape(activeCourses[0].id)}">Tiếp tục học</button>` : ''}
            </div>
            <nav class="v2-shortcuts" aria-label="Truy cập nhanh">
              <button type="button" data-learning-tab="courses">${portalIcon('course', true)} Khóa học</button>
              <button type="button" data-learning-tab="exams">${portalIcon('exam', true)} Bài kiểm tra</button>
              <button type="button" data-learning-tab="awards">${portalIcon('medal', true)} Thành tích</button>
            </nav>
          </div>
          <section class="v2-tasks">
            <h3>Việc cần làm</h3>
            <div class="v2-task-grid">
            ${activeCourses.map(course => `<button type="button" class="v2-task" data-learning-course="${escape(course.id)}">
              <span class="v2-chip">Khóa học</span><strong>${escape(course.title)}</strong><small>${course.lessons.filter(lesson => lesson.completed).length}/${course.lessons.length} bài đã hoàn thành</small></button>`).join('')}
            ${upcoming.map(course => `<button type="button" class="v2-task" data-learning-exam="${escape(course.id)}">
              <span class="v2-chip">Bài kiểm tra</span><strong>${escape(course.title)}</strong>
              <small>${course.canStart ? 'Hạn nộp' : 'Mở lúc'} · ${escape((course.canStart ? course.closesAt : course.opensAt) ? new Date(course.canStart ? course.closesAt : course.opensAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : 'Không giới hạn')}</small></button>`).join('')}
            ${activeCourses.length || upcoming.length ? '' : '<p>Chưa có bài học hoặc bài kiểm tra cần làm.</p>'}
            </div>
          </section>
          <aside class="v2-journey" aria-label="Hành trình học tập">
            <h3>Hành trình học tập</h3>${history(home.history.slice(0, 4))}
            <button type="button" class="button secondary-button" data-learning-tab="awards">Xem thành tích</button>
          </aside>
        </div>`;
      }
      if (active === 'courses') {
        const current = home.courses.find(course => course.id === selectedCourse);
        if (!current) {
          const courses = home.courses.map(course => {
            const done = course.lessons.filter(lesson => lesson.completed).length;
            const total = course.lessons.length;
            return {...course, done, total, status: done && done === total ? 'done' : done ? 'active' : 'new'};
          });
          catalog('Thư viện khóa học', courses, 'Tiến độ', '<option value="new">Chưa học</option><option value="active">Đang học</option><option value="done">Hoàn thành</option>', course => `
            <article class="catalog-card"><div class="catalog-card-top">${portalIcon('course')}<span class="v2-chip">${{new:'Chưa học',active:'Đang học',done:'Hoàn thành'}[course.status]}</span></div>
              <h3>${escape(course.title)}</h3><p>${escape(course.description)}</p>
              <div class="catalog-card-end"><span>${course.total ? `${course.done}/${course.total} bài hoàn thành` : 'Chưa có bài học'}</span>
              <button class="button secondary-button" type="button" data-learning-course="${escape(course.id)}">Mở khóa học</button></div>
            </article>`);
          return;
        }
        content.innerHTML = '<button type="button" class="button secondary-button" data-learning-tab="courses">Về thư viện khóa học</button>' + [current].map(course => {
          const completed = course.lessons.filter(lesson => lesson.completed).length;
          return `<article class="learning-card"><h3>${escape(course.title)}</h3><p>${escape(course.description)}</p>
            <p>${completed}/${course.lessons.length} bài học hoàn thành</p>${course.lessons.map(lesson =>
              `<div class="learning-row"><span><strong>${escape(lesson.title)}</strong>
                <a href="https://drive.google.com/file/d/${encodeURIComponent(lesson.fileId)}/view" target="_blank" rel="noopener noreferrer">Xem video trên Drive</a></span>
                <button type="button" class="button secondary-button" data-course="${escape(course.id)}" data-lesson="${escape(lesson.id)}"
                  ${lesson.completed ? 'disabled' : ''}>${lesson.completed ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}</button></div>`).join('')}
            ${course.examId ? `<button type="button" class="button secondary-button" data-learning-exam="${escape(course.examId)}">Xem bài kiểm tra</button>` : ''}</article>`;
        }).join('');
      }
      if (active === 'results') {
        catalog('Kết quả bài kiểm tra', home.history.map(item => ({...item,status:item.result === 'PASS' ? 'pass' : 'retry'})),
          'Kết quả', '<option value="pass">Đạt</option><option value="retry">Chưa đạt</option>', item => `
          <article class="catalog-card"><div class="catalog-card-top">${portalIcon(item.status)}<span class="exam-state" data-state="${item.status === 'pass' ? 'OPEN' : 'UPCOMING'}">${item.status === 'pass' ? 'Đạt' : 'Chưa đạt'}</span></div>
            <h3>${escape(item.title)}</h3><p>Đã nộp ${escape(item.submittedAt)}</p>
            <div class="catalog-card-end"><strong class="catalog-score">${escape(item.score)}/${escape(item.total)}</strong>
            <button class="button secondary-button" type="button" data-result="${escape(item.id)}">Xem chi tiết</button></div>
          </article>`);
      }
      if (active === 'awards') {
        content.innerHTML = '<h2>Thành tích</h2><h3>Chứng nhận và huy hiệu</h3><div class="v2-achievements">' +
          (home.awards.length ? home.awards.map(award => `<article class="learning-card">
            <div class="v2-award-icons">${portalIcon('medal')}${portalIcon('certificate')}</div>
            <span class="learning-badge">Huy hiệu hoàn thành</span><h3>${escape(award.title)}</h3>
            <p>Ngày đạt ${escape(award.awardedAt)} · Mã chứng nhận ${escape(award.id)}</p>
            <button type="button" class="button secondary-button" data-certificate="${escape(award.id)}">In mẫu chứng nhận</button>
            </article>`).join('') : '<p>Chưa có chứng nhận.</p>') + '</div><h3>Lịch sử thi</h3>' + history(home.history);
      }
      if (active === 'profile') {
        content.innerHTML = `<h2>Hồ sơ cá nhân</h2><form class="learning-form">
          <label>Email<input value="${escape(home.profile.email)}" readonly></label>
          <label>Họ và tên<input name="name" autocomplete="name" maxlength="120" required value="${escape(home.profile.name)}"></label>
          <label>Công ty<input name="company" autocomplete="organization" maxlength="150" required value="${escape(home.profile.company)}"></label>
          <button type="submit" class="button">Lưu hồ sơ</button></form>`;
        wireForm(content.querySelector('form'), async data => {
          const current = home;
          await request('updateLearningProfile', data);
          if (current !== home || !state.participant) return;
          if (state.participant?.email === home.profile.email) {
            Object.assign(state.participant, data);
            document.querySelector('.course-user-name').textContent = data.name;
            document.querySelector('.course-user-meta span').textContent = data.company;
          }
          home = {...home, profile:{...home.profile, ...data}};
        }, status);
      }
    }

    async function select(tab, courseId = '') {
      const id = ++generation;
      active = tab;
      selectedCourse = courseId;
      exams.hidden = tab !== 'exams';
      content.hidden = tab === 'exams';
      navigation.querySelectorAll('[data-learning-tab]').forEach(button =>
        button.setAttribute('aria-pressed', String(button.dataset.learningTab === tab)));
      status.textContent = '';
      if (tab === 'exams') return;
      content.replaceChildren();
      status.textContent = 'Đang tải…';
      try {
        const data = await request('learningHome');
        if (id !== generation || document.getElementById('courseView').hidden) return;
        home = data;
        render();
        status.textContent = '';
      } catch (error) {
        if (id === generation) status.textContent = error.message;
      }
    }

    learner.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.learningTab) return select(button.dataset.learningTab);
      if (button.dataset.learningCourse) return select('courses', button.dataset.learningCourse);
      if (button.dataset.learningExam) {
        await select('exams');
        const search = document.getElementById('examSearch');
        search.value = state.courses.find(course => course.id === button.dataset.learningExam)?.title || '';
        document.getElementById('examWindowFilter').value = '';
        window.updateExamFilters();
        return;
      }
      if (button.dataset.result) return viewAttemptResult(button.dataset.result);
      if (button.dataset.certificate) {
        const printArea = document.getElementById('learningCertificate');
        const logo = document.querySelector('.brand img').src;
        printArea.innerHTML = `<article class="certificate-sheet">
          <header><img src="${escape(logo)}" alt="Sungrow"><span>No. <i></i></span></header>
          <h1>CERTIFICATE</h1>
          <div class="certificate-fields">
            <p>This certifies that <i></i></p>
            <p>has successfully completed the training course <i></i></p>
            <p>Training dates <i></i></p>
            <p>For <i></i></p>
          </div>
          <footer>Sungrow Power Supply Co. Ltd<br>Engineering and Technical Service Center<br>Date <i></i></footer>
        </article>`;
        document.body.classList.add('printing-certificate');
        try { window.print(); } finally { document.body.classList.remove('printing-certificate'); printArea.replaceChildren(); }
      }
      if (button.dataset.lesson) {
        button.disabled = true;
        try {
          await request('completeLearningLesson', {learningId:button.dataset.course, lessonId:button.dataset.lesson});
          if (active === 'courses' && selectedCourse === button.dataset.course) await select('courses', selectedCourse);
        } catch (error) {
          status.textContent = error.message;
          button.disabled = false;
        }
      }
    });
    navigation.addEventListener('click', event => {
      const button=event.target.closest('[data-learning-tab]');
      if(button) select(button.dataset.learningTab);
    });
    window.LearningPortal = {open:() => select('overview'), close:() => {generation++; home = null; content.replaceChildren(); status.textContent = '';}};
  }

  if (admin) {
    const content = admin.querySelector('.learning-content');
    const status = admin.querySelector('[role=status]');
    const request = (action, data = {}) => callApi(action, {...data, adminToken:sessionStorage.getItem(ADMIN_SESSION_KEY) || adminToken});
    function render(data, selected = '') {
      const course = data.courses.find(item => item.id === selected);
      content.innerHTML = `<label for="learningCoursePicker">Khóa học</label>
        <select id="learningCoursePicker"><option value="">Tạo khóa mới</option>${data.courses.map(item =>
          `<option value="${escape(item.id)}" ${item.id === selected ? 'selected' : ''}>${escape(item.title)} · ${item.published ? 'Đã xuất bản' : 'Nháp'}</option>`).join('')}</select>
        <form class="learning-form" id="learningCourseForm">
          <label>Tên khóa học<input name="title" required maxlength="150" value="${escape(course?.title)}"></label>
          <label>Mô tả<textarea name="description" rows="3" maxlength="2000">${escape(course?.description)}</textarea></label>
          <label>Bài kiểm tra liên kết<select name="examId"><option value="">Không có</option>${data.exams.map(exam =>
            `<option value="${escape(exam.id)}" ${course?.examId === exam.id ? 'selected' : ''}>${escape(exam.title)}</option>`).join('')}</select></label>
          <label class="learning-check"><input name="award" type="checkbox" ${course?.award ? 'checked' : ''}> Cấp chứng nhận và huy hiệu khi thi đạt</label>
          <label class="learning-check"><input name="published" type="checkbox" ${course?.published ? 'checked' : ''}> Xuất bản cho học viên</label>
          <button class="button" type="submit">Lưu khóa học</button>
        </form>
        ${course ? `<h3>Bài học và video</h3><p>Tải video vào Drive của Sungrow rồi dán đường dẫn hoặc mã tệp. Hãy kiểm tra quyền xem với tài khoản học viên.</p>
          ${course.lessons.map(lesson => `<div class="learning-row"><a href="https://drive.google.com/file/d/${encodeURIComponent(lesson.fileId)}/view" target="_blank" rel="noopener noreferrer">${escape(lesson.title)}</a>
            <button type="button" class="button secondary" data-edit-lesson="${escape(lesson.id)}">Sửa</button></div>`).join('')}
          <form class="learning-form" id="learningLessonForm"><input type="hidden" name="lessonId">
            <label>Tên bài học<input name="title" required maxlength="150"></label>
            <label>Video Google Drive<input name="file" required maxlength="400"></label>
            <button class="button" type="submit">Lưu bài học</button>
          </form>` : ''}`;
      content.querySelector('select').onchange = event => render(data, event.target.value);
      wireForm(content.querySelector('#learningCourseForm'), async values => {
        const saved = await request('saveLearningContent', {...values, kind:'course', learningId:selected,
          award:values.award === 'on', published:values.published === 'on'});
        render(saved, selected || saved.courses.find(item => !data.courses.some(old => old.id === item.id))?.id);
      }, status);
      if (!course) return;
      const lessonForm = content.querySelector('#learningLessonForm');
      content.querySelectorAll('[data-edit-lesson]').forEach(button => button.onclick = () => {
        const lesson = course.lessons.find(item => item.id === button.dataset.editLesson);
        lessonForm.elements.lessonId.value = lesson.id;
        lessonForm.elements.title.value = lesson.title;
        lessonForm.elements.file.value = lesson.fileId;
        lessonForm.elements.title.focus();
      });
      wireForm(lessonForm, async values => {
        const file = values.file.trim();
        const fileId = file.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)(?:\/|\?|$)/)?.[1] || file;
        const saved = await request('saveLearningContent', {kind:'lesson', learningId:selected,
          lessonId:values.lessonId, title:values.title, fileId});
        render(saved, selected);
      }, status);
    }
    admin.addEventListener('toggle', async () => {
      if (!admin.open) return;
      const epoch = adminEpoch;
      status.textContent = 'Đang tải…';
      try {
        const data = await request('adminLearningCatalog');
        if (epoch !== adminEpoch || !admin.open) return;
        render(data);
        status.textContent = '';
      }
      catch (error) { status.textContent = error.message; }
    });
  }
})();
