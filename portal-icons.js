(() => {
  const shapes = {
    medal:'<path d="m8 14-2 8 4-2 2 3 2-5m2-4 2 8-4-2-2 3" fill="#ff7900"/><circle cx="12" cy="10" r="7" fill="#ffe0a2" stroke="#934600"/><path d="m12 6 1.2 2.4 2.6.4-1.9 1.9.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.9 2.6-.4Z" fill="#934600"/>',
    certificate:'<rect x="3" y="3" width="18" height="15" rx="2" fill="#fff0dc" stroke="#934600"/><path d="M7 8h9M7 11h6" stroke="#934600"/><path d="m14 17-.6 5 2.6-1.5 2.6 1.5-.6-5" fill="#934600"/><circle cx="16" cy="16" r="3" fill="#ffb35b" stroke="#934600"/>',
    progress:'<rect x="3" y="3" width="18" height="18" rx="5" fill="#d9e7ff"/><path d="M7 16v-3m5 3v-6m5 6V7" stroke="#274e92" stroke-width="2" stroke-linecap="round"/>',
    exam:'<rect x="5" y="4" width="14" height="17" rx="2" fill="#e8e4ff" stroke="#514093"/><rect x="9" y="2" width="6" height="5" rx="1" fill="#514093"/><path d="M8 11h8m-8 4h6" stroke="#514093" stroke-width="1.5"/>',
    pass:'<circle cx="12" cy="12" r="10" fill="#ddf4e7"/><path d="m7 12 3 3 7-7" fill="none" stroke="#256842" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    retry:'<circle cx="12" cy="12" r="10" fill="#ffebda"/><path d="M7 11a5 5 0 1 1 1 5m-1-9v4h4" fill="none" stroke="#954000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    course:'<path d="M3 5c4-2 7-1 9 1 2-2 5-3 9-1v14c-4-2-7-1-9 1-2-2-5-3-9-1Z" fill="#ffe8d2" stroke="#934600"/><path d="M12 6v14" stroke="#934600"/>'
  };
  window.portalIcon = (name, small = false) => `<svg class="v2-icon${small ? ' v2-icon--small' : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shapes[name] || ''}</svg>`;
})();
