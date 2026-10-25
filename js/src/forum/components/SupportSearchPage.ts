import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import Link from 'flarum/common/components/Link';
import PageStructure from 'flarum/forum/components/PageStructure';
import SupportIndexSidebar from './SupportIndexSidebar';
import SupportTicketRow from './SupportTicketRow';
import { tr, trText } from '../utils/translate';
import { showError } from '../utils/helpers';
import { canHandleSupportTickets } from '../utils/permissions';
import { loadTickets } from '../utils/api';
import { SUPPORT_TICKETS_RESOURCE } from '../query/ticketGambits';

const PAGE_SIZE = 25;

export default class SupportSearchPage extends Page {
  static providesInitialSearch = true;
  loading = true;
  error: any = null;
  tickets: any[] = [];
  hasMore = false;
  loadingMore = false;
  query = '';
  _lastLoadedQuery = '';
  _loadSeq = 0;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.loading = true;
    this.error = null;
    this.tickets = [];
    this.query = (m.route.param('q') || '').trim();
    this._lastLoadedQuery = this.query;
    app.current.set('query', this.query);

    const title = this.query
      ? trText('index.search_results_title', 'Search results for "{query}"', { query: this.query })
      : trText('index.search_tickets_title', 'Search tickets');
    try {
      app.setTitle(title);
    } catch (e) {}
    app.history.push('linkrobins-support.search', title);
    this._load();
  }

  onbeforeupdate(vnode: any) {
    const nextQuery = (m.route.param('q') || '').trim();
    if (nextQuery !== this._lastLoadedQuery) {
      this.query = nextQuery;
      this._lastLoadedQuery = nextQuery;
      app.current.set('query', nextQuery);
      const title = this.query
        ? trText('index.search_results_title', 'Search results for "{query}"', { query: this.query })
        : trText('index.search_tickets_title', 'Search tickets');
      try {
        app.setTitle(title);
      } catch (e) {}
      Promise.resolve().then(() => this._load());
    }
    return true;
  }

  onremove(vnode: any) {
    app.current.set('query', null);
    super.onremove(vnode);
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

  _load() {
    this.loading = true;
    this.error = null;
    m.redraw();

    const seq = ++this._loadSeq;

    loadTickets(this._params(0, PAGE_SIZE))
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
        console.error('[linkrobins/support] search load failed:', err);
        m.redraw();
      });
  }

  _loadMore() {
    if (this.loadingMore) return;
    this.loadingMore = true;
    m.redraw();

    loadTickets(this._params(this.tickets.length, PAGE_SIZE))
      .then((more: any) => {
        const seen = new Set(this.tickets.map((t: any) => String(t.id())));
        this.tickets = this.tickets.concat((more || []).filter((t: any) => !seen.has(String(t.id()))));
        this.hasMore = !!(more && more.payload && more.payload.links && more.payload.links.next);
        this.loadingMore = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.loadingMore = false;
        console.error('[linkrobins/support] load more search tickets failed:', err);
        showError(tr('errors.load_more_tickets', 'Could not load more tickets.'));
        m.redraw();
      });
  }

  view() {
    const content = m('div', { className: 'LinkRobinsSupport-container' }, [this._renderHeader(), this._renderList()]);

    return m(
      PageStructure,
      {
        className: 'IndexPage LinkRobinsSupport-page LinkRobinsSupport-searchPage',
        sidebar: () => this._renderSidebar(),
      },
      content
    );
  }

  _renderSidebar() {
    try {
      return m(SupportIndexSidebar, {
        className: 'LinkRobinsSupport-sidebar',
        activeFilter: null,
      });
    } catch (e) {
      console.error('[linkrobins/support] sidebar render failed:', e);
    }
    return null;
  }

  _renderHeader() {
    const count = this.tickets.length;
    return m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-searchHeader' }, [
      m(
        Link,
        {
          href: app.route('linkrobins-support.index'),
          className: 'Button Button--link LinkRobinsSupport-backButton',
          title: trText('index.back_to_desk', 'Back to support'),
        },
        [m('i', { className: 'fas fa-arrow-left', 'aria-hidden': 'true' }), ' ', tr('index.back_to_desk', 'Back to support')]
      ),
      m('h1', { className: 'LinkRobinsSupport-title' }, [
        m('i', { className: 'fas fa-search' }),
        ' ',
        this.query
          ? tr('index.search_results_title', 'Search results for "{query}"', { query: this.query })
          : tr('index.search_tickets_title', 'Search tickets'),
      ]),
      !this.loading && !this.error && this.query
        ? m('div', { className: 'LinkRobinsSupport-searchMeta' }, [
            count === 1
              ? tr('index.tickets_found', '{count} ticket found', { count: String(count) })
              : tr('index.tickets_found_plural', '{count} tickets found', {
                  count: `${count}${this.hasMore ? '+' : ''}`,
                }),
          ])
        : null,
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
      return m('div', { className: 'LinkRobinsSupport-empty' }, [
        m('p', tr('index.no_results', 'No tickets match your search.')),
        m(
          Button,
          {
            className: 'Button Button--link',
            onclick: () => {
              if (app.search && app.search.state) {
                app.search.state.clear();
              }
              m.route.set(app.route('linkrobins-support.index'));
            },
          },
          tr('index.reset_search', 'Clear search')
        ),
      ]);
    }
    return [
      m(
        'div',
        { className: 'LinkRobinsSupport-list' },
        this.tickets.map((t: any) => m(SupportTicketRow, { ticket: t, key: 'ticket-' + t.id() }))
      ),
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
