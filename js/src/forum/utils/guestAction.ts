import { BASE_PATH, basePath, isGuest } from './helpers';

/**
 * Where a guest was headed when they were sent to the log-in modal.
 *
 * Core's LogInModal finishes with window.location.reload(), which wipes every
 * JS variable, so the target rides through the reload in sessionStorage. It is
 * written just before the modal opens and cleared the moment the modal closes
 * without a login (the close, X and Escape paths all call app.modal.close()),
 * and it expires after a few minutes as a backstop, so a stale target never
 * redirects someone who logs in later by another route.
 */
const KEY = 'linkrobins-support.afterLogin';
const MAX_AGE_MS = 5 * 60 * 1000;

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
}

function setTarget(path: string): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch (e) {}
}

export function clearGuestTarget(): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch (e) {}
}

/**
 * Open the log-in modal for a guest who tried an action, remembering where to
 * take them afterwards. Never imports LogInModal statically: it is a lazy
 * chunk in Flarum 2.
 */
export function promptLogIn(path: string = BASE_PATH + '/new'): void {
  setTarget(path);
  app.modal.show(() => import('flarum/forum/components/LogInModal')).catch(() => clearGuestTarget());
}

/**
 * After the post-login reload: if a target was stored, clear it and go there.
 * A guest (login did not happen) keeps nothing stored for later.
 */
export function followGuestTarget(): void {
  const s = store();
  if (!s) return;
  let raw: string | null = null;
  try {
    raw = s.getItem(KEY);
  } catch (e) {}
  if (!raw) return;
  if (isGuest()) return; // the modal is still the pending step; close() clears it
  clearGuestTarget();
  try {
    const t = JSON.parse(raw);
    if (!t || typeof t.path !== 'string' || t.path.charAt(0) !== '/' || Date.now() - t.at > MAX_AGE_MS) return;
    const here = window.location.pathname.replace(basePath(), '');
    // Deferred: oncreate runs while the first route is still rendering.
    if (here !== t.path) setTimeout(() => m.route.set(t.path), 0);
  } catch (e) {}
}

/**
 * Drop the stored target whenever an open modal is closed (X, backdrop,
 * Escape, Back). Core also calls close() on every page init, including the one
 * right after the login reload; with no modal open that call does nothing, and
 * it must not clear the target we are about to follow, hence the guard.
 */
export function clearTargetOnModalClose(): void {
  const state: any = app.modal;
  const original = state.close;
  state.close = function (this: any, ...args: any[]) {
    const wasOpen = !!this.modal;
    const result = original.apply(this, args);
    if (wasOpen) clearGuestTarget();
    return result;
  };
}
