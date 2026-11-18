export function styleControls({ state, locked }) {
  const $ = id => document.getElementById(id);
  const launcher = $('open-tool-style'), panel = $('tool-style-popover');
  let focusFrame=null;
  const isOpen = () => panel.matches(':popover-open');
  function position(force=false) {
    if (!isOpen() && force!==true) return;
    const anchor = launcher.getBoundingClientRect(), box = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(innerWidth - box.width - 8, anchor.left));
    const below = anchor.bottom + 8;
    const top = below + box.height <= innerHeight - 8 ? below : Math.max(8, anchor.top - box.height - 8);
    Object.assign(panel.style, { left: `${left}px`, top: `${top}px` });
  }
  function close() { cancelAnimationFrame(focusFrame); if (isOpen()) panel.hidePopover(); }
  function render() {
    const current = state(), value = current.tool === 'text' ? current.fontSize : current.tool === 'number' ? null : current.width;
    $('style-color-preview').style.backgroundColor = current.color;
    $('style-color-value').textContent = current.color.toUpperCase();
    $('style-value').textContent = value == null ? '' : `${value} px`;
    launcher.setAttribute('aria-label', `標註樣式，顏色 ${current.color}，${value == null ? '編號' : current.tool === 'text' ? '字級 ' + value + ' px' : '粗細 ' + value + ' px'}`);
    launcher.disabled = locked(); if (launcher.disabled) close(); else position();
  }
  const beforeToggle = event => {
    launcher.setAttribute('aria-expanded', String(event.newState === 'open'));
    if(event.newState==='open'){
      panel.style.display='grid';position(true);panel.style.removeProperty('display');
      queueMicrotask(()=>{if(isOpen())position();});
    }
  };
  const toggle = event => { launcher.setAttribute('aria-expanded', String(event.newState === 'open')); if(event.newState==='open'){position();if(document.activeElement===launcher)panel.querySelector('input:not(:disabled)')?.focus({preventScroll:true});} };
  const keydown = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); close(); launcher.focus({ preventScroll: true });
  };
  const launchKey = event => {
    if(!['Enter',' '].includes(event.key)||launcher.disabled)return;
    event.preventDefault();if(event.repeat)return;
    if(isOpen()){close();return;}
    panel.showPopover();position();
    focusFrame=requestAnimationFrame(()=>{if(isOpen())panel.querySelector('input:not(:disabled)')?.focus({preventScroll:true});});
  };
  const focus = event => { if (isOpen() && !panel.contains(event.target) && event.target !== launcher) close(); };
  panel.addEventListener('beforetoggle', beforeToggle); panel.addEventListener('toggle', toggle); panel.addEventListener('keydown', keydown);
  launcher.addEventListener('keydown',launchKey);
  document.addEventListener('focusin', focus); document.addEventListener('scroll', position, true); window.addEventListener('resize', position);
  render();
  return { render, close, get isOpen() { return isOpen(); }, destroy() { close(); launcher.removeEventListener('keydown',launchKey); panel.removeEventListener('beforetoggle', beforeToggle); panel.removeEventListener('toggle', toggle); panel.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focus); document.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); } };
}
