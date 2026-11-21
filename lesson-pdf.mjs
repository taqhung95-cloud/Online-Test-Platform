import { AnnotationMode, GlobalWorkerOptions, getDocument } from './vendor/pdfjs-6.5.438/pdf.min.mjs';

const assets = new URL('./vendor/pdfjs-6.5.438/', import.meta.url);
GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', assets).href;

export async function showLessonPdf({url, view, toolbar, label, signal, onError}) {
  if (signal.aborted) return;
  const loading = getDocument({
    url,
    cMapUrl:new URL('cmaps/', assets).href,
    cMapPacked:true,
    standardFontDataUrl:new URL('standard_fonts/', assets).href,
    wasmUrl:new URL('wasm/', assets).href,
    iccUrl:new URL('iccs/', assets).href,
    disableAutoFetch:true,
    disableStream:true,
    isEvalSupported:false
  });
  let observer, renderTask, renderFrame, pdf;
  let revision = 0;
  let pageNumber = 1;
  let zoom = 1;
  let shownPage = 0;
  let disposed = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    cancelAnimationFrame(renderFrame);
    renderTask?.cancel();
    loading.destroy().catch(()=>{});
    toolbar.hidden = true;
    toolbar.replaceChildren();
    toolbar.removeAttribute('focusgroup');
    toolbar.removeAttribute('role');
    toolbar.removeAttribute('aria-label');
  }
  signal.addEventListener('abort',dispose,{once:true});

  function button(text, name, activate) {
    const element = document.createElement('button');
    element.className = 'button secondary-button';
    element.type = 'button';
    element.textContent = text;
    element.title = name;
    element.setAttribute('aria-label',name);
    element.addEventListener('click',()=>{
      if (element.getAttribute('aria-disabled') !== 'true') activate();
    },{signal});
    return element;
  }
  const changePage = step => {
    pageNumber += step;
    scheduleRender();
  };
  const changeZoom = step => {
    zoom += step;
    scheduleRender();
  };
  const previous = button('‹','Trang trước',()=>changePage(-1));
  const next = button('›','Trang sau',()=>changePage(1));
  const smaller = button('−','Thu nhỏ',()=>changeZoom(-.25));
  const larger = button('+','Phóng to',()=>changeZoom(.25));
  const pageCount = document.createElement('span');
  pageCount.setAttribute('role','status');
  const zoomLevel = document.createElement('span');
  zoomLevel.setAttribute('role','status');

  function updateControls() {
    previous.setAttribute('aria-disabled',String(pageNumber === 1));
    next.setAttribute('aria-disabled',String(pageNumber === pdf.numPages));
    smaller.setAttribute('aria-disabled',String(zoom <= 1));
    larger.setAttribute('aria-disabled',String(zoom >= 3));
    const zoomText = Math.round(zoom * 100) + '%';
    if (zoomLevel.textContent !== zoomText) zoomLevel.textContent = zoomText;
  }

  function group(name,...items) {
    const container = document.createElement('div');
    container.setAttribute('role','group');
    container.setAttribute('aria-label',name);
    container.append(...items);
    return container;
  }

  async function renderPage() {
    const current = ++revision;
    const requestedPage = pageNumber;
    const requestedZoom = zoom;
    renderTask?.cancel();
    const page = await pdf.getPage(requestedPage);
    if (disposed || current !== revision) return;
    const base = page.getViewport({scale:1});
    const fit = Math.min((view.clientWidth - 20) / base.width,(view.clientHeight - 20) / base.height);
    const viewport = page.getViewport({scale:Math.max(.01,fit * requestedZoom)});
    const density = Math.min(window.devicePixelRatio || 1,Math.sqrt(12000000 / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(viewport.width * density));
    canvas.height = Math.max(1,Math.round(viewport.height * density));
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label',label + ', trang ' + requestedPage);
    const job = page.render({canvas,viewport,transform:[density,0,0,density,0,0],annotationMode:AnnotationMode.DISABLE});
    renderTask = job;
    try {
      await job.promise;
      if (disposed || current !== revision) return;
      view.replaceChildren(canvas);
      if (shownPage !== requestedPage) {
        view.scrollTo(0,0);
        shownPage = requestedPage;
        pageCount.textContent = 'Trang ' + requestedPage + ' / ' + pdf.numPages;
      }
    } catch (error) {
      if (!disposed && current === revision && error.name !== 'RenderingCancelledException') throw error;
    } finally {
      if (renderTask === job) renderTask = null;
      if (!canvas.isConnected) canvas.width = canvas.height = 0;
    }
  }

  function scheduleRender() {
    updateControls();
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(()=>{
      renderPage().catch(error=>{if (!disposed) onError(error);});
    });
  }

  try {
    pdf = await loading.promise;
    if (disposed) return;
    updateControls();
    await renderPage();
    if (disposed) return;

    toolbar.setAttribute('role','toolbar');
    toolbar.setAttribute('aria-label','Điều khiển tài liệu');
    toolbar.setAttribute('focusgroup','toolbar wrap');
    toolbar.replaceChildren(group('Chuyển trang',previous,pageCount,next),group('Tỷ lệ xem',smaller,zoomLevel,larger));
    const buttons = [previous,next,smaller,larger];
    if (!('focusGroup' in HTMLElement.prototype)) {
      const setTabStop = current => buttons.forEach(button=>{button.tabIndex=button===current?0:-1;});
      setTabStop(previous);
      toolbar.addEventListener('focusin',event=>{if(buttons.includes(event.target))setTabStop(event.target);},{signal});
      toolbar.addEventListener('keydown',event=>{
        const index = buttons.indexOf(event.target);
        if (index < 0) return;
        const rtl = getComputedStyle(toolbar).direction === 'rtl';
        const direction = {ArrowRight:rtl?-1:1,ArrowLeft:rtl?1:-1}[event.key];
        const target = event.key==='Home'?0:event.key==='End'?buttons.length-1:
          direction?(index+direction+buttons.length)%buttons.length:null;
        if (target===null) return;
        event.preventDefault();
        buttons[target].focus();
      },{signal});
    }
    toolbar.hidden = false;
    let dimensions = view.clientWidth + 'x' + view.clientHeight;
    observer = new ResizeObserver(()=>{
      const current = view.clientWidth + 'x' + view.clientHeight;
      if (current === dimensions) return;
      dimensions = current;
      scheduleRender();
    });
    observer.observe(view);
  } catch (error) {
    const cancelled = disposed;
    dispose();
    if (!cancelled) throw error;
  }
}
