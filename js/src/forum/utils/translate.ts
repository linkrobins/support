import extractText from 'flarum/common/utils/extractText';

const NS = 'linkrobins-support.forum.';

function flattenToText(node: any): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenToText).join('');
  if (node.children != null) return flattenToText(node.children);
  if (node.text != null) return String(node.text);
  return '';
}

/**
 * Translate a key under this extension's forum namespace. Strings live in
 * locale/en.yml (linkrobins-support.forum.*) so they're translatable; an
 * optional English fallback keeps the UI sensible if a key is ever missing.
 *
 * NB: never name a param `user` -- the core translator reserves it (extracts
 * it, derives `username`), which previously broke these strings.
 */
export function tr(key: string, fallback?: string, params?: Record<string, any>): any {
  try {
    const out = app.translator.trans(NS + key, params || {});
    if (typeof out === 'string' && out.indexOf('linkrobins-support.') !== 0) {
      return out;
    }
    if (out != null && typeof out !== 'string') {
      return out; // rich (vdom) translation
    }
  } catch (e) {}
  // Fall back to the inline English template. Interpolate {placeholder} tokens
  // ourselves so an unresolved/missing key never leaks raw braces to the user.
  let tmpl = fallback != null ? fallback : key;
  if (params) {
    tmpl = tmpl.replace(/\{(\w+)\}/g, (whole, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
    );
  }
  return tmpl;
}

/**
 * Like tr(), but ALWAYS returns a plain string. Use whenever a translation is
 * placed in an HTML attribute (title, placeholder, value): with {placeholder}
 * params the core translator returns an ARRAY of parts which would coerce to a
 * comma-joined string in an attribute. extractText flattens it cleanly.
 */
export function trText(key: string, fallback?: string, params?: Record<string, any>): string {
  const out = tr(key, fallback, params);
  if (typeof out === 'string') return out;
  try {
    const s = extractText(out);
    if (typeof s === 'string') return s;
  } catch (e) {}
  return flattenToText(out);
}
