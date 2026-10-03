/**
 * The numbers beside the support sidebar links, shared by every page.
 *
 * Refreshed when a sidebar mounts and whenever something that changes them
 * happens (a live update, a status or assignment change, reading a ticket).
 * Refreshes are folded together, since one action often triggers several.
 */
export type SupportCounts = Record<string, number>;

let counts: SupportCounts = {};
let timer: any = null;

export function supportCount(key: string): number {
  return counts[key] || 0;
}

export function refreshCounts(): void {
  if (!app.session || !app.session.user) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    app
      .request<{ data: SupportCounts }>({ method: 'GET', url: app.forum.attribute('apiUrl') + '/linkrobins-support-counts' })
      .then((res: any) => {
        counts = (res && res.data) || {};
        m.redraw();
      })
      .catch(() => {});
  }, 300);
}

/** Which count goes beside which sidebar filter. Closed and All get none. */
export const COUNT_FOR_FILTER: Record<string, string> = {
  mine: 'mine_unread',
  assigned_to_me: 'assigned_to_me',
  unassigned: 'unassigned',
  open: 'open',
  in_progress: 'in_progress',
  awaiting_user: 'awaiting_user',
  resolved: 'resolved',
};
