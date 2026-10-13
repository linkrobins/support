import type Mithril from 'mithril';
import app from 'flarum/forum/app';
import Link from 'flarum/common/components/Link';
import LinkButton from 'flarum/common/components/LinkButton';
import type { GlobalSearchSource } from 'flarum/common/components/AbstractGlobalSearch';
import extractText from 'flarum/common/utils/extractText';
import { tr } from '../utils/translate';
import { canHandleSupportTickets } from '../utils/permissions';
import { statusChip } from '../utils/status';
import { loadTickets } from '../utils/api';
import { SUPPORT_TICKETS_RESOURCE } from './ticketGambits';

/**
 * Global search source implementation for linkrobins support tickets.
 * Powers Flarum's SearchModal when searching support desk tickets.
 */
export default class SupportTicketsSearchSource implements GlobalSearchSource {
  protected results = new Map<string, any[]>();

  public resource: string = SUPPORT_TICKETS_RESOURCE;

  title(): string {
    return extractText(tr('index.tickets', 'Tickets'));
  }

  isCached(query: string): boolean {
    return this.results.has(query.toLowerCase().trim());
  }

  async search(query: string, limit: number): Promise<void> {
    const key = query.toLowerCase().trim();
    this.results.set(key, []);

    let filter: Record<string, any> = { q: key };
    if (app.search && app.search.gambits) {
      filter = app.search.gambits.apply(SUPPORT_TICKETS_RESOURCE, filter);
    }

    if (!canHandleSupportTickets()) {
      filter.mine = '1';
    }

    if (filter.q !== undefined && !String(filter.q).trim()) {
      delete filter.q;
    }

    return loadTickets({ filter, page: { limit } })
      .then((results: any) => {
        this.results.set(key, results || []);
        m.redraw();
      })
      .catch((err: any) => {
        console.error('[linkrobins/support] search source failed:', err);
        this.results.set(key, []);
        m.redraw();
      });
  }

  view(query: string): Array<Mithril.Vnode> {
    const key = query.toLowerCase().trim();
    const tickets = this.results.get(key) || [];

    return tickets.map((ticket: any) => {
      const cat = ticket.category && ticket.category();
      const status = ticket.status && ticket.status();
      const number = ticket.id ? ticket.id() : '';

      return m(
        'li',
        {
          className: 'DiscussionSearchResult LinkRobinsSupport-searchResult',
          'data-index': 'tickets' + number,
          'data-id': number,
        },
        m(
          Link,
          {
            href: app.route('linkrobins-support.show', { id: number }),
            className: 'LinkRobinsSupport-searchResult-link',
            onclick: () => app.modal.close(),
          },
          [
            m('span', { className: 'LinkRobinsSupport-searchResult-subject' }, [
              m('span', { className: 'LinkRobinsSupport-searchResult-number' }, `#${number} `),
              ticket.subject() || tr('index.untitled', 'Untitled'),
            ]),
            m('span', { className: 'LinkRobinsSupport-searchResult-meta' }, [
              cat
                ? m('span', { className: 'LinkRobinsSupport-searchResult-cat' }, [
                    cat.color()
                      ? m('span', {
                          className: 'LinkRobinsSupport-chip-dot',
                          style: { background: cat.color() },
                        })
                      : null,
                    cat.name(),
                  ])
                : null,
              statusChip(status),
            ]),
          ]
        )
      );
    }) as Array<Mithril.Vnode>;
  }

  customGrouping(): boolean {
    return false;
  }

  fullPage(query: string): Mithril.Vnode {
    const trimmed = query.trim();
    return m(
      'li',
      m(
        LinkButton,
        {
          icon: 'fas fa-search',
          href: app.route('linkrobins-support.search', trimmed ? { q: trimmed } : {}),
          onclick: () => app.modal.close(),
        },
        tr('index.search_all_tickets', 'View all tickets matching "{query}"', { query: trimmed })
      )
    );
  }

  gotoItem(id: string): string | null {
    return app.route('linkrobins-support.show', { id });
  }
}
