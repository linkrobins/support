import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import ItemList from 'flarum/common/utils/ItemList';
import type { GlobalSearchSource } from 'flarum/common/components/AbstractGlobalSearch';
import { canCreateSupportTicket, canHandleSupportTickets } from './utils/permissions';
import { SUPPORT_TICKETS_RESOURCE } from './query/ticketGambits';
import SupportTicketsSearchSource from './query/SupportTicketsSearchSource';

export default function addSupportSearch() {
  // Add tickets as a search source to the global search modal without removing discussions/users
  extend(GlobalSearch.prototype, 'sourceItems', function (items: ItemList<GlobalSearchSource>) {
    if (canCreateSupportTicket() || canHandleSupportTickets()) {
      items.add('tickets', new SupportTicketsSearchSource());
    }
  });

  // Automatically select support tickets source when on support desk routes
  override('flarum/common/components/SearchModal' as any, 'defaultActiveSource', function (original: any) {
    const orig = original();
    if (!orig && app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      return SUPPORT_TICKETS_RESOURCE;
    }
    return orig;
  });

  // Populate default filters for support tickets based on active route
  extend('flarum/common/components/SearchModal' as any, 'defaultFilters', function (this: any, filters: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      filters[SUPPORT_TICKETS_RESOURCE] ||= {};
      const routeName = app.current.get('routeName');

      if (routeName === 'linkrobins-support.filtered') {
        const status = m.route.param('status');
        if (status && status !== 'all') {
          filters[SUPPORT_TICKETS_RESOURCE].status = status;
        }
      } else if (routeName === 'linkrobins-support.index') {
        if (canHandleSupportTickets()) {
          filters[SUPPORT_TICKETS_RESOURCE].status = 'open';
        }
      } else if (routeName === 'linkrobins-support.show') {
        const ticketId = m.route.param('id');
        const ticket = app.current.get('ticket') || (ticketId ? app.store.getById('linkrobins-support-tickets', ticketId) : null);
        const cat = ticket && typeof ticket.category === 'function' ? ticket.category() : null;
        const slug = cat && typeof cat.slug === 'function' ? cat.slug() : null;
        if (slug) {
          filters[SUPPORT_TICKETS_RESOURCE].category = slug;
        }
      }
    }
  });
}
