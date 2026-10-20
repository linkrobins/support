import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import PageStructure from 'flarum/forum/components/PageStructure';
import SupportIndexSidebar from './SupportIndexSidebar';
import SupportTicketRow from './SupportTicketRow';
import { tr, trText } from '../utils/translate';
import { showError } from '../utils/helpers';
import { canCreateSupportTicket, canHandleSupportTickets } from '../utils/permissions';
import { loadTickets } from '../utils/api';
import { onLive } from '../utils/live';
import { SUPPORT_TICKETS_RESOURCE, registerTicketGambits } from '../query/ticketGambits';

const PAGE_SIZE = 25;

export default class SupportIndexPage extends Page {
  loading = true;
  error: any = null;
  tickets: any[] = [];
  // Lists load a page at a time; "Load more" fetches the next one.
  hasMore = false;
  loadingMore = false;
  // Unified query string representing the active triage work queue.
  query = '';
  _lastLoadedQuery = '';
  // Each load gets a number; a response that is not the latest is dropped.
  _loadSeq = 0;
  _stopLive: (() => void) | null = null;
  _liveTimer: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    registerTicketGambits();
    this.loading = true;
    this.error = null;
    this.tickets = [];
    this.query = this._queryFromAttrs(this.attrs);
    this._lastLoadedQuery = this.query;
    app.current.set('query', this.query);
    try {
      app.setTitle(tr('nav', 'Support'));
    } catch (e) {}
    app.history.push('linkrobins-support.index', trText('nav', 'Support'));
    this._load();
  }

  oncreate(vnode: any) {
    super.oncreate(vnode);
    // A ticket opened or moved somewhere: refetch the list in place so new
    // tickets appear and moved ones leave this view. Debounced.
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
    app.current.set('query', null);
    super.onremove(vnode);
  }

  onbeforeupdate(vnode: any) {
    const nextQuery = this._queryFromAttrs(vnode.attrs);
    if (nextQuery !== this._lastLoadedQuery) {
      this.query = nextQuery;
      this._lastLoadedQuery = nextQuery;
      app.current.set('query', nextQuery);
      Promise.resolve().then(() => this._load());
    }
    return true;
  }

  _queryFromAttrs(_attrs: any): string {
    const qParam = m.route.param('q');
    if (typeof qParam === 'string' && qParam.trim()) {
      return qParam.trim();
    }
    if (canHandleSupportTickets()) {
      const pref = app.session?.user?.preferences()?.linkrobinsSupportStaffDefaultView;
      return typeof pref === 'string' && pref.trim() ? pref.trim() : 'is:open';
    }
    return 'is:mine';
  }

  _headingTitle(): any {
    const q = this.query.trim();
    if (!q || q === 'is:mine') return tr('index.my_tickets', 'My tickets');
    if (q === 'is:open') return tr('status.open', 'Open');
    if (q === 'assigned:me -is:closed') return tr('index.filter_assigned_to_me', 'Assigned to me');
    if (q === 'is:unassigned -is:closed') return tr('index.filter_unassigned', 'Unassigned');
    if (q === 'is:closed') return tr('status.closed', 'Closed');
    return tr('nav', 'Support');
  }

  _load(quiet = false) {
    // A quiet reload keeps the current list on screen instead of a spinner.
    if (!quiet) {
      this.loading = true;
      m.redraw();
    }

    // A quiet (live) reload refetches everything already on screen, so a list
    // the viewer has paged through does not snap back to the first page.
    const limit = quiet ? Math.min(100, Math.max(PAGE_SIZE, this.tickets.length)) : PAGE_SIZE;
    const seq = ++this._loadSeq;

    loadTickets(this._params(0, limit))
      .then((tickets: any) => {
        if (seq !== this._loadSeq) return;
        this.tickets = tickets || [];
        this.hasMore = !!(tickets && tickets.payload && tickets.payload.links && tickets.payload.links.next);
        this.loading = false;
        m.redraw();
      })
      .catch((err: any) => {
        if (seq !== this._loadSeq) return;
        this.error = err;
        this.loading = false;
        console.error('[linkrobins/support] index load failed:', err);
        m.redraw();
      });
  }

  _loadMore() {
    if (this.loadingMore) return;
    this.loadingMore = true;
    m.redraw();

    loadTickets(this._params(this.tickets.length, PAGE_SIZE))
      .then((more: any) => {
        // Skip anything already shown, in case the list shifted between pages.
        const seen = new Set(this.tickets.map((t: any) => String(t.id())));
        this.tickets = this.tickets.concat((more || []).filter((t: any) => !seen.has(String(t.id()))));
        this.hasMore = !!(more && more.payload && more.payload.links && more.payload.links.next);
        this.loadingMore = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.loadingMore = false;
        console.error('[linkrobins/support] load more tickets failed:', err);
        showError(tr('errors.load_more_tickets', 'Could not load more tickets.'));
        m.redraw();
      });
  }

  _params(offset: number, limit: number) {
    let filter: Record<string, any> = {};
    if (this.query.trim()) {
      filter.q = this.query.trim();
      if (app.search && app.search.gambits) {
        filter = app.search.gambits.apply(SUPPORT_TICKETS_RESOURCE, filter);
      }
    }

    if (!canHandleSupportTickets()) {
      filter.mine = '1';
    }

    if (filter.q !== undefined && !String(filter.q).trim()) {
      delete filter.q;
    }

    const params: any = { page: { offset, limit } };
    if (Object.keys(filter).length) {
      params.filter = filter;
    }
    return params;
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
        query: this.query,
      });
    } catch (e) {
      console.error('[linkrobins/support] sidebar render failed:', e);
    }
    return null;
  }

  _renderHeader() {
    return m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-indexHeader' }, [
      m('h1', { className: 'LinkRobinsSupport-title' }, [m('i', { className: 'fas fa-life-ring' }), ' ', this._headingTitle()]),
    ]);
  }

  _renderList() {
    if (this.loading) {
      return m(LoadingIndicator);
    }
    if (this.error) {
      return m('div', { className: 'LinkRobinsSupport-empty' }, tr('errors.load_tickets', 'Could not load tickets.'));
    }
    if (!this.tickets.length) {
      const q = this.query.trim();
      let emptyMessage: any;

      if (!q || q === 'is:mine') {
        emptyMessage = canCreateSupportTicket()
          ? tr('index.empty_own', 'No tickets yet. Click "New ticket" to open one.')
          : tr('index.empty_no_create', 'No tickets yet.');
      } else if (q === 'is:open') {
        emptyMessage = tr('index.empty_status.open', 'No open tickets.');
      } else if (q === 'assigned:me -is:closed') {
        emptyMessage = tr('index.empty_assigned_to_me', 'No open tickets are assigned to you.');
      } else if (q === 'is:unassigned -is:closed') {
        emptyMessage = tr('index.empty_unassigned', 'Every open ticket has been claimed.');
      } else if (q === 'is:closed') {
        emptyMessage = tr('index.empty_status.closed', 'No closed tickets.');
      } else {
        emptyMessage = tr('index.empty', 'No tickets to show.');
      }

      return m('div', { className: 'LinkRobinsSupport-empty' }, emptyMessage);
    }
    return [
      m(
        'div',
        { className: 'LinkRobinsSupport-list' },
        this.tickets.map((t: any) => m(SupportTicketRow, { ticket: t, key: 'ticket-' + t.id() }))
      ),
      // Exactly how core's discussion list does it: its container class,
      // a plain button with core's own "Load More" wording swapped for spinner while loading.
      this.hasMore || this.loadingMore
        ? m(
            'div',
            { className: 'DiscussionList-loadMore' },
            this.loadingMore
              ? m(LoadingIndicator)
              : m(
                  Button,
                  { className: 'Button', onclick: () => this._loadMore() },
                  app.translator.trans('core.forum.discussion_list.load_more_button')
                )
          )
        : null,
    ];
  }
}
