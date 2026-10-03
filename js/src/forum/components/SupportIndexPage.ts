import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Avatar from 'flarum/common/components/Avatar';
import PageStructure from 'flarum/forum/components/PageStructure';
import SupportIndexSidebar from './SupportIndexSidebar';
import { tr, trText } from '../utils/translate';
import { basePath, BASE_PATH, formatDate, safeNavigate } from '../utils/helpers';
import { canCreateSupportTicket, canHandleSupportTickets } from '../utils/permissions';
import { statusChip, FILTER_OPTIONS, filterLabel, emptyLabel } from '../utils/status';
import { loadTickets } from '../utils/api';
import { onLive } from '../utils/live';

export default class SupportIndexPage extends Page {
  loading = true;
  error: any = null;
  tickets: any[] = [];
  filter: string | null = 'mine';
  _lastLoadedFilter: string | null = 'mine';
  _stopLive: (() => void) | null = null;
  _liveTimer: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.loading = true;
    this.error = null;
    this.tickets = [];
    this.filter = this._filterFromAttrs(this.attrs);
    try {
      app.setTitle(tr('nav', 'Support'));
    } catch (e) {}
    this._lastLoadedFilter = this.filter;
    this._load();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    // A ticket opened or moved somewhere: refetch the list in place so new
    // tickets appear and moved ones leave this view. Debounced, since one
    // action can produce a few pushes in a row (a reply, then its status).
    this._stopLive = onLive((kind) => {
      if (kind !== 'ticket') return;
      clearTimeout(this._liveTimer);
      this._liveTimer = setTimeout(() => this._load(true), 500);
    });
  }

  onremove(vnode: any) {
    if (this._stopLive) this._stopLive();
    this._stopLive = null;
    clearTimeout(this._liveTimer);
    super.onremove(vnode);
  }

  onbeforeupdate(vnode: any) {
    const nextFilter = this._filterFromAttrs(vnode.attrs);
    if (nextFilter !== this._lastLoadedFilter) {
      this.filter = nextFilter;
      this._lastLoadedFilter = nextFilter;
      Promise.resolve().then(() => this._load());
    }
    return true;
  }

  _filterFromAttrs(attrs: any): string {
    const defaultFilter = canHandleSupportTickets() ? 'open' : 'mine';
    const s = attrs && attrs.status;
    if (!s) return defaultFilter;
    for (let i = 0; i < FILTER_OPTIONS.length; i++) {
      if (FILTER_OPTIONS[i].id === s) return s;
    }
    return defaultFilter;
  }

  _load(quiet = false) {
    // A quiet reload keeps the current list on screen instead of a spinner.
    if (!quiet) {
      this.loading = true;
      m.redraw();
    }

    const filter: any = {};
    if (canHandleSupportTickets() && this.filter !== 'mine') {
      if (this.filter === 'assigned_to_me' || this.filter === 'unassigned') {
        // Work queues: what is still to be done, so closed tickets drop out.
        filter.assigned = this.filter === 'assigned_to_me' ? 'me' : 'none';
        filter['-status'] = 'closed';
      } else if (this.filter && this.filter !== 'all') {
        filter.status = this.filter;
      }
    } else {
      filter.mine = '1';
    }
    const params: any = { page: { limit: 25 } };
    if (Object.keys(filter).length) {
      params.filter = filter;
    }

    loadTickets(params)
      .then((tickets: any[]) => {
        this.tickets = tickets || [];
        this.loading = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.error = err;
        this.loading = false;
        console.error('[linkrobins/support] index load failed:', err);
        m.redraw();
      });
  }

  view() {
    const content = m('div', { className: 'LinkRobinsSupport-container' }, [this._renderHeader(), this._renderList()]);

    return m(
      PageStructure,
      {
        className: 'IndexPage LinkRobinsSupport-page',
        sidebar: () => this._renderSidebar(),
      },
      content
    );
  }

  _renderSidebar() {
    try {
      return m(SupportIndexSidebar, {
        className: 'LinkRobinsSupport-sidebar',
        activeFilter: this.filter,
      });
    } catch (e) {
      console.error('[linkrobins/support] sidebar render failed:', e);
    }
    return null;
  }

  _renderHeader() {
    const label = this._headingFor(this.filter);
    return m('header', { className: 'LinkRobinsSupport-header' }, [
      m('h1', { className: 'LinkRobinsSupport-title' }, [m('i', { className: 'fas fa-life-ring' }), ' ', label]),
    ]);
  }

  _headingFor(filter: string | null) {
    if (!filter || filter === 'mine') return tr('nav', 'Support');
    for (let i = 0; i < FILTER_OPTIONS.length; i++) {
      if (FILTER_OPTIONS[i].id === filter) return filterLabel(FILTER_OPTIONS[i]);
    }
    return tr('nav', 'Support');
  }

  _renderList() {
    if (this.loading) {
      return m(LoadingIndicator);
    }
    if (this.error) {
      return m('div', { className: 'LinkRobinsSupport-empty' }, tr('errors.load_tickets', 'Could not load tickets.'));
    }
    if (!this.tickets.length) {
      return m('div', { className: 'LinkRobinsSupport-empty' }, emptyLabel(this.filter, canCreateSupportTicket()));
    }
    return m(
      'div',
      { className: 'LinkRobinsSupport-list' },
      this.tickets.map((t: any) => this._renderRow(t))
    );
  }

  /**
   * Who has the ticket, for staff scanning the queue: their avatar and name,
   * or an "Unassigned" marker. Members see their own tickets only and do not
   * need routing detail, so it is staff-only.
   */
  /**
   * Who has the ticket, for staff scanning the queue, as a chip under the
   * status: their avatar and name, or "Unassigned". It sits apart from the
   * meta line so it is never mistaken for the person who opened the ticket.
   * Members see only their own tickets and do not need routing detail.
   */
  _renderAssignee(ticket: any) {
    if (!canHandleSupportTickets()) return null;
    const assignee = ticket.assignedStaff && ticket.assignedStaff();
    if (!assignee) {
      return m('span', { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee is-unassigned' }, [
        m('i', { className: 'fas fa-user-slash', 'aria-hidden': 'true' }),
        tr('index.unassigned', 'Unassigned'),
      ]);
    }
    const name = assignee.displayName() || assignee.username();
    return m(
      'span',
      { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee', title: trText('index.assigned_to', 'Assigned to {name}', { name }) },
      [m(Avatar, { user: assignee }), name]
    );
  }

  _renderRow(ticket: any) {
    const user = ticket.user && ticket.user();
    const cat = ticket.category && ticket.category();
    const href = basePath() + BASE_PATH + '/' + encodeURIComponent(ticket.id());
    const isDeleted = !!(ticket.isDeleted && ticket.isDeleted());

    return m(
      'a',
      {
        href,
        className: 'LinkRobinsSupport-row' + (isDeleted ? ' LinkRobinsSupport-row--deleted' : ''),
        onclick: (e: any) => {
          safeNavigate(href, e);
        },
        key: 'ticket-' + ticket.id(),
      },
      [
        m('div', { className: 'LinkRobinsSupport-row-main' }, [
          m('div', { className: 'LinkRobinsSupport-row-subject' }, [
            ticket.subject() || tr('index.untitled', 'Untitled'),
            isDeleted ? m('span', { className: 'LinkRobinsSupport-row-deletedBadge' }, tr('index.deleted_badge', 'Deleted')) : null,
          ]),
          m('div', { className: 'LinkRobinsSupport-row-meta' }, [
            cat
              ? m('span', { className: 'LinkRobinsSupport-row-cat' }, [
                  m('span', { className: 'LinkRobinsSupport-chip-dot', style: { background: cat.color() || 'var(--muted-color)' } }),
                  cat.name(),
                ])
              : null,
            user ? m('span', { className: 'LinkRobinsSupport-row-user' }, user.displayName() || user.username()) : null,
            m('span', { className: 'LinkRobinsSupport-row-date' }, formatDate(ticket.lastReplyAt() || ticket.createdAt())),
          ]),
        ]),
        m('div', { className: 'LinkRobinsSupport-row-side' }, [statusChip(ticket.status()), this._renderAssignee(ticket)]),
      ]
    );
  }
}
