import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import PageStructure from 'flarum/forum/components/PageStructure';
import SupportIndexSidebar from './SupportIndexSidebar';
import { tr } from '../utils/translate';
import { basePath, BASE_PATH, formatDate, safeNavigate } from '../utils/helpers';
import { canCreateSupportTicket, canHandleSupportTickets } from '../utils/permissions';
import { statusBadge, FILTER_OPTIONS, filterLabel } from '../utils/status';
import { loadTickets } from '../utils/api';

export default class SupportIndexPage extends Page {
  loading = true;
  error: any = null;
  tickets: any[] = [];
  filter: string | null = 'mine';
  _lastLoadedFilter: string | null = 'mine';

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

  _load() {
    this.loading = true;
    m.redraw();

    const filter: any = {};
    if (canHandleSupportTickets() && this.filter !== 'mine') {
      if (this.filter && this.filter !== 'all') {
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
    const content = m('div', { className: 'LinkRobinsSupport-container' }, [
      this._renderHeader(),
      this._renderList(),
    ]);

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
      return m(
        'div',
        { className: 'LinkRobinsSupport-empty' },
        canCreateSupportTicket()
          ? tr('index.empty_own', 'No tickets yet. Click "New ticket" to open one.')
          : tr('index.empty', 'No tickets to show.')
      );
    }
    return m(
      'div',
      { className: 'LinkRobinsSupport-list' },
      this.tickets.map((t: any) => this._renderRow(t))
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
            isDeleted
              ? m('span', { className: 'LinkRobinsSupport-row-deletedBadge' }, tr('index.deleted_badge', 'Deleted'))
              : null,
          ]),
          m('div', { className: 'LinkRobinsSupport-row-meta' }, [
            cat
              ? m(
                  'span',
                  { className: 'LinkRobinsSupport-row-cat', style: 'color: ' + (cat.color() || 'inherit') },
                  cat.name()
                )
              : null,
            user
              ? m('span', { className: 'LinkRobinsSupport-row-user' }, user.displayName() || user.username())
              : null,
            m('span', { className: 'LinkRobinsSupport-row-date' }, formatDate(ticket.lastReplyAt() || ticket.createdAt())),
          ]),
        ]),
        m('div', { className: 'LinkRobinsSupport-row-status' }, statusBadge(ticket.status())),
      ]
    );
  }
}
