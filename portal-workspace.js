(() => {
  const search = document.getElementById('examSearch');
  if (search) {
    const windowFilter = document.getElementById('examWindowFilter');
    const sort = document.getElementById('examSort');
    const grid = document.getElementById('courseGrid');
    function update() {
      const query = search.value.trim().toLocaleLowerCase('vi');
      const cards = [...grid.querySelectorAll('.course-card')];
      cards.sort((a,b) => {
        if (sort.value === 'start') return (Date.parse(a.dataset.opens) || Infinity) - (Date.parse(b.dataset.opens) || Infinity);
        if (sort.value === 'end') return (Date.parse(a.dataset.closes) || Infinity) - (Date.parse(b.dataset.closes) || Infinity);
        return Number(a.dataset.position)-Number(b.dataset.position);
      });
      let visible = 0;
      cards.forEach(card => {
        card.hidden = !card.textContent.toLocaleLowerCase('vi').includes(query) ||
          (windowFilter.value !== '' && windowFilter.value !== card.dataset.window);
        if (!card.hidden) visible++;
        grid.append(card);
      });
      document.getElementById('examNoMatches').hidden = !cards.length || visible > 0;
    }
    search.addEventListener('input', update);
    windowFilter.addEventListener('change', update);
    sort.addEventListener('change', update);
    window.updateExamFilters = update;
  }
  const adminNav = document.getElementById('v2AdminNav');
  if (adminNav) {
    const main = document.querySelector('.v2-admin-main');
    function open(button) {
      const target = button.dataset.adminPage;
      adminNav.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      main.querySelectorAll('[data-admin-section]').forEach(section => {
        section.hidden = !section.dataset.adminSection.split(' ').includes(target) ||
          (section.id === 'learningAdmin' && section.dataset.available !== 'true');
      });
      const panel = document.getElementById(target === 'learning' ? 'learningAdmin' : 'schedulePanel');
      if (target !== 'reports' && panel && !panel.hidden) panel.open = true;
      document.getElementById('v2AdminTitle').textContent = button.textContent.trim();
    }
    adminNav.addEventListener('click', event => {
      const button = event.target.closest('[data-admin-page]');
      if (button) open(button);
    });
    window.updateAdminWorkspace = ready => {
      document.getElementById('learningAdmin').dataset.available = String(ready);
      adminNav.querySelector('[data-admin-page=learning]').hidden = !ready;
      open(adminNav.querySelector('button[aria-pressed=true]:not([hidden])') || adminNav.querySelector('button'));
    };
    open(adminNav.querySelector('button'));
  }
})();
