export const ComfyDialog = window.ComfyDialog || class { constructor() {} };
export const $el = window.$el || ((tag, attrs, children) => {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else {
        el[k] = v;
      }
    }
  }
  return el;
});
export const addStylesheet = window.addStylesheet || ((url) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
  return link;
});
export const getUrl = window.getUrl || ((path, base) => base ? new URL(path, base).toString() : path);
