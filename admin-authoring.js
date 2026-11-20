(() => {
  const headers = 'ID,Question,OptionA,OptionB,OptionC,OptionD,CorrectOption,Active,Category,Explanation,Difficulty';

  function bindUpload(form, request, learningId, refresh) {
    const button = form.querySelector('button[type=submit]');
    const status = form.querySelector('[role=status]');
    const progress = form.querySelector('progress');
    const input = form.elements.file;
    let job;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      const file = input.files[0];
      const title = form.elements.title.value.trim();
      if (!file?.size || !title) {
        status.textContent = 'Nhập tên bài học và chọn tệp có nội dung.';
        return;
      }
      if (job?.file !== file || job.title !== title) job = {id:crypto.randomUUID(), file, title};
      button.disabled = input.disabled = form.elements.title.disabled = true;
      progress.hidden = false;
      progress.max = file.size;
      status.textContent = 'Đang chuẩn bị tải lên Drive…';
      const stale = job.started;
      try {
        const {chunkSize} = await request('adminBeginLessonUpload', {
          uploadId:job.id, learningId, title, fileName:file.name, size:file.size
        });
        job.started = true;
        let result = stale ? await request('adminUploadLessonChunk',{uploadId:job.id,offset:0})
          : {offset:0,done:false};
        while (!result.done) {
          const offset = result.offset;
          const blob = file.slice(offset, offset + chunkSize);
          if (!blob.size) throw new Error('Drive chưa xác nhận tệp hoàn tất. Bấm Thử lại.');
          const data = await new Promise((resolve,reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Không đọc được tệp đã chọn.'));
            reader.readAsDataURL(blob);
          });
          result = await request('adminUploadLessonChunk',{uploadId:job.id,offset,data});
          if (!result.done && result.offset <= offset) throw new Error('Tải bị gián đoạn. Bấm Thử lại để tiếp tục.');
          progress.value = result.offset;
          status.textContent = 'Đã tải ' + Math.floor(100 * result.offset / file.size) + '%';
        }
        await refresh();
      } catch (error) {
        status.textContent = error.message;
        if (/hết hạn/i.test(error.message)) job = undefined;
        button.textContent = 'Thử lại';
      } finally {
        button.disabled = input.disabled = form.elements.title.disabled = false;
      }
    });
  }

  function installExamEditor(nav, main, request) {
    if (nav.querySelector('[data-admin-page=exam-authoring]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.adminPage = 'exam-authoring';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = portalIcon('exam') + '<span class="v4-label">Bài kiểm tra</span>';
    button.setAttribute('aria-label', 'Bài kiểm tra');
    const panel = document.createElement('section');
    panel.dataset.adminSection = 'exam-authoring';
    panel.className = 'panel';
    panel.hidden = true;
    panel.innerHTML = `
      <h3>Thiết lập bài kiểm tra</h3>
      <label>Bài kiểm tra<select data-exam-picker></select></label>
      <p role="status" aria-live="polite"></p>
      <form class="learning-form" hidden>
        <label>Mã bài mới<input name="id" minlength="2" maxlength="40" placeholder="VD: MGRL_2026"></label>
        <label>Tên bài kiểm tra<input name="title" required maxlength="150"></label>
        <label>Mô tả<textarea name="description" rows="2" maxlength="2000"></textarea></label>
        <label>Số câu mỗi lượt<input name="questionCount" type="number" required min="1" max="1000"></label>
        <label>Thời lượng (phút)<input name="durationMinutes" type="number" required min="1" max="1440"></label>
        <label>Ngưỡng đạt (%)<input name="passPercent" type="number" required min="1" max="100"></label>
        <label><input name="active" type="checkbox"> Bật bài kiểm tra</label>
        <details>
          <summary>Thêm câu hỏi</summary>
          <div class="learning-form" data-question-fields>
            <label>Nội dung câu hỏi<textarea data-question="Question" rows="2"></textarea></label>
            <label>Phương án A<input data-question="OptionA"></label>
            <label>Phương án B<input data-question="OptionB"></label>
            <label>Phương án C<input data-question="OptionC"></label>
            <label>Phương án D<input data-question="OptionD"></label>
            <label>Đáp án đúng<select data-question="CorrectOption"><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
            <label>Chủ đề<input data-question="Category"></label>
            <label>Giải thích<textarea data-question="Explanation" rows="2"></textarea></label>
            <label>Độ khó<select data-question="Difficulty"><option>Medium</option><option>Hard</option><option>Scenario</option></select></label>
            <button class="button secondary-button" type="button" data-add-question>Thêm vào ngân hàng</button>
          </div>
        </details>
        <label>Nhập ngân hàng từ CSV<input name="csvFile" type="file" accept=".csv,text/csv"></label>
        <label>Ngân hàng câu hỏi (CSV)<textarea name="csv" rows="12" wrap="off" required aria-describedby="authoring-csv-hint"></textarea></label>
        <p id="authoring-csv-hint">Giữ nguyên tiêu đề và ID câu cũ. Đặt Active=FALSE để ngừng dùng một câu.</p>
        <button class="button" type="submit">Lưu bài kiểm tra</button>
      </form>`;
    const parent = main.querySelector('#schedulePanel')?.parentElement;
    if (!parent) return;
    parent.append(panel);
    nav.insertBefore(button, nav.querySelector('[data-admin-page=exams]'));
    const picker = panel.querySelector('select');
    const form = panel.querySelector('form');
    const status = panel.querySelector('[role=status]');
    const fields = form.elements;
    const save = form.querySelector('button[type=submit]');
    let current;
    let generation = 0;
    let loaded = false;
    let busy = false;

    function show(data) {
      const prior = data.exam?.id || '';
      current = data.exam || null;
      picker.replaceChildren(new Option('Tạo bài mới', ''), ...data.exams.map(exam => new Option(exam.title, exam.id)));
      picker.value = prior;
      fields.id.value = prior;
      fields.id.readOnly = Boolean(current);
      fields.id.required = !current;
      for (const [name, fallback] of Object.entries({title:'',description:'',questionCount:40,durationMinutes:60,passPercent:80})) {
        fields[name].value = current?.[name] ?? fallback;
      }
      fields.active.checked = current?.active === true;
      fields.csv.value = data.csv || headers + '\n';
      fields.csvFile.value = '';
      form.hidden = false;
      status.textContent = current ? 'Tab câu hỏi: ' + current.questionSheet : '';
    }

    async function load(id) {
      if (busy) return;
      const nonce = ++generation;
      status.textContent = 'Đang tải…';
      form.hidden = true;
      try {
        const data = await request('adminExamEditor', {courseId:id});
        if (nonce !== generation) return;
        show(data);
        loaded = true;
      } catch (error) { if (nonce === generation) status.textContent = error.message; }
    }
    picker.addEventListener('change', () => load(picker.value));
    button.addEventListener('click', () => { if (!loaded) load(''); });
    form.querySelector('[data-add-question]').addEventListener('click', () => {
      const inputs = [...form.querySelectorAll('[data-question]')];
      const question = Object.fromEntries(inputs.map(input => [input.dataset.question,input.value.trim()]));
      if (!['Question','OptionA','OptionB','OptionC','OptionD'].every(name => question[name])) {
        status.textContent = 'Nhập câu hỏi và đủ bốn phương án.';
        return;
      }
      const row = {...question,ID:'Q-' + crypto.randomUUID().slice(0,12),Active:'TRUE'};
      const csv = headers.split(',').map(name => '"' + row[name].replace(/"/g,'""') + '"').join(',');
      fields.csv.value = (fields.csv.value.trimEnd() || headers) + '\n' + csv + '\n';
      inputs.filter(input => input.tagName !== 'SELECT').forEach(input => { input.value = ''; });
      status.textContent = 'Đã thêm câu hỏi. Bấm Lưu bài kiểm tra để cập nhật Google Sheet.';
    });
    fields.csvFile.addEventListener('change', async () => {
      const csv = fields.csvFile.files[0];
      if (!csv) return;
      if (csv.size > 1500000) {
        status.textContent = 'Tệp CSV vượt 1,5 MB.';
        return;
      }
      try { fields.csv.value = await csv.text(); }
      catch { status.textContent = 'Không đọc được tệp CSV.'; }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = picker.disabled = save.disabled = true;
      status.textContent = 'Đang lưu…';
      try {
        const values = Object.fromEntries(new FormData(form));
        delete values.csvFile;
        const response = await request('adminSaveExam', {
          ...values, courseId:current?.id || '', version:current?.version || '',
          active:fields.active.checked
        });
        show(response);
        status.textContent = 'Đã lưu bài kiểm tra và cập nhật tab ' + response.exam.questionSheet + '.';
        window.refreshCourseWindows?.(true);
      } catch (error) { status.textContent = error.message; }
      finally { busy = picker.disabled = save.disabled = false; }
    });
  }

  function installCourseUpload(content, course, request, refresh) {
    const heading = document.createElement('h4');
    heading.textContent = 'Tải tệp từ máy';
    content.append(document.createElement('hr'), heading);
    const note = document.createElement('p');
    if (!course.folderId) {
      note.textContent = 'Lưu khóa học để tạo thư mục Drive riêng.';
      content.append(note);
      return;
    }
    const folder = document.createElement('a');
    folder.href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(course.folderId);
    folder.target = '_blank';
    folder.rel = 'noopener noreferrer';
    folder.textContent = 'Mở thư mục khóa học trên Drive';
    note.append(folder);
    const form = document.createElement('form');
    form.className = 'learning-form';
    form.id = 'trainingUploadForm';
    form.innerHTML = `
      <label>Tên bài học<input name="title" required maxlength="150"></label>
      <label>Tệp video, PDF hoặc PowerPoint<input name="file" type="file" required accept=".mp4,.webm,.mov,.m4v,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"></label>
      <button class="button" type="submit">Tải lên và thêm bài học</button>
      <progress hidden aria-label="Tiến độ tải tài liệu"></progress>
      <p role="status" aria-live="polite"></p>`;
    content.append(note, form);
    bindUpload(form, request, course.id, async () => {
      const updated = await request('adminLearningCatalog');
      if (form.isConnected) refresh(updated);
    });
  }

  window.AdminAuthoring = {installCourseUpload, installExamEditor};
})();
