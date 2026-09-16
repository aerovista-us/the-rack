'use strict';

/** Reader finishing fixes: keep covers unobstructed and make completion a separate screen. */
(() => {
  let endMode = false;
  const baseSyncChrome = syncChrome;
  const baseRenderItem = renderItem;
  const baseMoveSegment = moveSegment;

  const style = document.createElement('style');
  style.textContent = `
    .reader-stage--end{display:grid;place-items:center;padding:clamp(18px,4vw,44px)}
    .reader-stage--end .end-card{position:relative;left:auto;bottom:auto;transform:none;width:min(92vw,680px)}
    .reader-cover-page .reader-header,.reader-cover-page .reader-footer{opacity:0;pointer-events:none}
    .reader-cover-page .reader-header{transform:translateY(-75%)}
    .reader-cover-page .reader-footer{transform:translateY(70%)}
  `;
  document.head.append(style);

  function lastIndex(){ return Math.max(0,(state.book?.sequence?.length||1)-1); }

  function showEndScreen(){
    destroyBook();
    pauseActiveVideo();
    endMode = true;
    document.body.classList.remove('reader-motion','panel-focus-open','reader-cover-page','reader-chrome-hidden');
    els.stage.innerHTML='';
    els.stage.className='reader-stage reader-stage--end';
    renderEndCard();
    const total=state.book?.sequence?.length||1;
    els.position.textContent=`Finished · ${total} / ${total}`;
    els.progress.style.width='100%';
    els.prev.disabled=false;
    els.next.disabled=true;
    [...els.rail.children].forEach(node=>node.classList.remove('active'));
  }

  syncChrome = function syncChromeFinished(index=state.index){
    baseSyncChrome(index);
    document.querySelector('.end-card')?.remove();
    const total=state.book?.sequence?.length||0;
    const cover=index===0 || index===total-1;
    document.body.classList.toggle('reader-cover-page',cover);
    if(cover) document.body.classList.add('reader-chrome-hidden');
    if(index===total-1) els.next.disabled=false;
  };

  renderItem = function renderItemFinished(){
    if(endMode) return showEndScreen();
    return baseRenderItem();
  };

  moveSegment = function moveSegmentFinished(delta){
    if(endMode){
      if(delta<0){ endMode=false; state.index=lastIndex(); return baseRenderItem(); }
      return;
    }
    if(delta>0 && state.index>=lastIndex()) return showEndScreen();
    return baseMoveSegment(delta);
  };

  const baseShowReader=showReader;
  showReader=function showReaderFinished(){ endMode=false; return baseShowReader(); };
  const baseCloseReader=closeReader;
  closeReader=function closeReaderFinished(){ endMode=false; document.body.classList.remove('reader-cover-page'); return baseCloseReader(); };

  els.stage?.addEventListener('click',(event)=>{
    if(endMode || rackV3.panelMode || state.readerMode!=='book' || state.index<lastIndex()) return;
    if(!event.target.closest('.rack-physical-book')) return;
    const r=els.stage.getBoundingClientRect();
    if(event.clientX-r.left>r.width*.66){ event.preventDefault(); event.stopPropagation(); showEndScreen(); }
  });
})();
