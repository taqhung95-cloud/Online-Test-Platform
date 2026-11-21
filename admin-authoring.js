(() => {
  const headers = 'ID,Question,OptionA,OptionB,OptionC,OptionD,CorrectOption,Active,Category,Explanation,Difficulty';

  function bindUpload(form, request, learningId, refresh) {
    const button = form.querySelector('button[type=submit]');
    const status = form.querySelector('[role=status]');
    const progress = form.querySelector('progress');
    const input = form.elements.file;
    const minimumChunk = 256 * 1024;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    let job;
    async function checkUpload() {
      status.textContent = 'Đang kiểm tra phần Drive đã nhận…';
      try {
        return await request('adminUploadLessonChunk', {uploadId:job.id, offset:0});
      } catch (error) {
        if (!error.isTransportError) throw error;
        await pause(1000);
        return request('adminUploadLessonChunk', {uploadId:job.id, offset:0});
      }
    }
    function recordProgress(result) {
      const offset = result.offset;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > job.file.size ||
          (result.done && offset !== job.file.size)) {
        throw new Error('Drive trả về tiến độ tải tệp không hợp lệ.');
      }
      job.offset = offset;
      job.done = result.done === true;
      progress.value = offset;
      status.textContent = job.done
        ? 'Đã lưu bài học. Đang cập nhật danh sách…'
        : 'Drive đã nhận ' + Math.floor(100 * offset / job.file.size) + '%';
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      const file = input.files[0];
      const title = form.elements.title.value.trim();
      if (!file?.size || !title) {
        status.textContent = 'Nhập tên bài học và chọn tệp có nội dung.';
        return;
      }
      if (job?.file !== file || job.title !== title) job = {id:crypto.randomUUID(), file, title, offset:0};
      button.disabled = input.disabled = form.elements.title.disabled = true;
      progress.hidden = false;
      progress.max = file.size;
      progress.value = job.offset;
      status.textContent = 'Đang chuẩn bị tải lên Drive…';
      try {
        if (!job.done && job.started) recordProgress(await checkUpload());
        if (!job.started) {
          const {chunkSize, variableChunks} = await request('adminBeginLessonUpload', {
            uploadId:job.id, learningId, title, fileName:file.name, size:file.size, variableChunks:true
          });
          if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error('Máy chủ chưa gửi kích thước phần tải hợp lệ.');
          job.started = true;
          job.variableChunks = variableChunks === true;
          job.chunkSize = job.variableChunks && file.size <= 32 * 1024 * 1024
            ? Math.min(chunkSize, 1024 * 1024)
            : chunkSize;
        }
        let stalls = 0;
        while (!job.done) {
          const offset = job.offset;
          const blob = file.slice(offset, offset + job.chunkSize);
          if (!blob.size) {
            recordProgress(await checkUpload());
            if (!job.done && job.offset >= file.size) throw new Error('Drive đang xác nhận tệp. Bấm Thử lại để kiểm tra.');
            continue;
          }
          const data = await new Promise((resolve,reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Không đọc được tệp đã chọn.'));
            reader.readAsDataURL(blob);
          });
          let result;
          try {
            result = await request('adminUploadLessonChunk', {uploadId:job.id, offset, data});
          } catch (error) {
            if (!error.isTransportError) throw error;
            result = await checkUpload();
          }
          recordProgress(result);
          if (job.done || job.offset > offset) { stalls = 0; continue; }
          if (++stalls >= 3) throw new Error('Drive chưa nhận thêm dữ liệu. Bấm Thử lại để tiếp tục.');
          if (job.variableChunks) job.chunkSize = Math.max(minimumChunk,
            Math.floor(job.chunkSize / (2 * minimumChunk)) * minimumChunk);
          await pause(700 * stalls);
        }
        await refresh();
      } catch (error) {
        if (job.done) {
          status.textContent = 'Bài học đã được lưu. Bấm Thử lại để cập nhật danh sách.';
        } else if (/Lượt tải tệp đã hết hạn/i.test(error.message)) {
          job = undefined;
          progress.value = 0;
          status.textContent = 'Lượt tải đã hết hạn. Bấm Thử lại để bắt đầu lại với tệp đã chọn.';
        } else {
          status.textContent = error.isTransportError
            ? 'Chưa nhận được xác nhận từ Drive. Bấm Thử lại để tiếp tục với tệp đã chọn.'
            : error.message;
        }
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
    button.dataset.selected = 'false';
    button.innerHTML = portalIcon('examEditor') + '<span class="v4-label">Quản lý bài thi</span>';
    button.setAttribute('aria-label', 'Quản lý bài thi');
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
      status.textContent = '';
      const endLoading = Portal.contentLoading(panel);
      form.hidden = true;
      try {
        const data = await request('adminExamEditor', {courseId:id});
        if (nonce !== generation) return;
        show(data);
        loaded = true;
      } catch (error) { if (nonce === generation) status.textContent = error.message; }
      finally { endLoading(); }
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

  function installCourseUpload(sources, course, request, refresh) {
    const option = document.createElement('section');
    option.className = 'lesson-material-option';
    const heading = document.createElement('h4');
    heading.textContent = 'Tải tệp từ máy';
    option.append(heading);
    sources.append(option);
    if (!course.folderId) {
      const note = document.createElement('p');
      note.textContent = 'Lưu khóa học để tạo thư mục Drive riêng.';
      option.append(note);
      return;
    }
    const form = document.createElement('form');
    form.className = 'learning-form';
    form.id = 'trainingUploadForm';
    form.innerHTML = `
      <label>Tên bài học<input name="title" required maxlength="150"></label>
      <label>Tệp video, PDF hoặc PowerPoint
        <span class="training-file-picker">
          <input name="file" type="file" required accept=".mp4,.webm,.mov,.m4v,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
            aria-label="Chọn tệp đào tạo" aria-describedby="trainingFileName">
          <span class="training-file-button" aria-hidden="true">Chọn tệp</span>
          <span id="trainingFileName" class="training-file-name" aria-live="polite">Chưa chọn tệp</span>
        </span>
      </label>
      <button class="button" type="submit">Tải lên và thêm bài học</button>
      <progress hidden aria-label="Tiến độ tải tài liệu"></progress>
      <p role="status" aria-live="polite"></p>`;
    const name = form.querySelector('#trainingFileName');
    form.elements.file.addEventListener('change', () => {
      name.textContent = form.elements.file.files[0]?.name || 'Chưa chọn tệp';
      name.title = form.elements.file.files[0]?.name || '';
    });
    option.append(form);
    bindUpload(form, request, course.id, async () => {
      const updated = await request('adminLearningCatalog');
      if (form.isConnected) refresh(updated);
    });
  }

  window.AdminAuthoring = {installCourseUpload, installExamEditor};
})();
