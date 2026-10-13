import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import ItemList from 'flarum/common/utils/ItemList';
import Separator from 'flarum/common/components/Separator';
import { tr } from '../utils/translate';
import { showForumNavOnSupportPages } from '../utils/helpers';
import { canCreateSupportTicket, canHandleSupportTickets } from '../utils/permissions';
import { refreshCounts, supportCount, COUNT_FOR_FILTER } from '../utils/counts';
import { onLive } from '../utils/live';
import SupportStatsModal from './SupportStatsModal';

class SupportViewsDropdown extends SelectDropdown<any> {
  getButtonContent(children: any) {
    return super.getButtonContent([]);
  }
}

export default class SupportIndexSidebar extends IndexSidebar {
  _stopLive: (() => void) | null = null;

  oncreate(vnode: any) {
    super.oncreate(vnode);
    refreshCounts();
    this._stopLive = onLive(() => refreshCounts());
  }

  onremove(vnode: any) {
    if (this._stopLive) this._stopLive();
    this._stopLive = null;
    super.onremove(vnode);
  }

  items() {
    const items = new ItemList();

    if (canCreateSupportTicket()) {
      items.add(
        'newTicket',
        m(
          LinkButton,
          {
            href: app.route('linkrobins-support.compose'),
            icon: 'fas fa-plus',
            className: 'Button Button--primary LinkRobinsSupport-newTicketButton',
            itemClassName: 'App-primaryControl',
            'aria-label': tr('index.new_ticket', 'New ticket'),
            title: tr('index.new_ticket_tooltip', 'Open a new support ticket'),
          },
          tr('index.new_ticket', 'New ticket')
        ),
        110
      );
    }

    items.add(
      'nav',
      m(
        SupportViewsDropdown,
        {
          buttonClassName: 'Button',
          className: 'App-titleControl',
          accessibleToggleLabel: app.translator.trans('core.forum.index.toggle_sidenav_dropdown_accessible_label'),
          defaultLabel: this._currentLabel(),
        },
        this.navItems().toArray()
      ),
      90
    );

    return items;
  }

  navItems() {
    const items = showForumNavOnSupportPages() ? this.forumNavItems() : new ItemList();
    const canHandle = canHandleSupportTickets();
    const isSearch = app.current.get('routeName') === 'linkrobins-support.search';
    const isIndex = app.current.get('routeName') === 'linkrobins-support.index';
    const q = (this.attrs && typeof this.attrs.query === 'string' ? this.attrs.query : '').trim();

    if (showForumNavOnSupportPages()) {
      items.add('linkrobinsSupportSeparator', m(Separator), -20);
    }

    // Member view: My tickets (for staff, narrows explicitly to own tickets)
    items.add(
      'support-mine',
      m(
        LinkButton,
        {
          href: app.route('linkrobins-support.index', canHandle ? { q: 'is:mine' } : {}),
          icon: 'fas fa-user',
          active: isIndex && (canHandle ? q === 'is:mine' : !q || q === 'is:mine'),
        },
        [tr('index.my_tickets', 'My tickets'), this._count('mine')]
      ),
      -21
    );

    // Staff triage work queues
    if (canHandle) {
      items.add(
        'support-open',
        m(
          LinkButton,
          {
            href: app.route('linkrobins-support.index', { q: 'is:open' }),
            icon: 'fas fa-circle',
            active: isIndex && q === 'is:open',
          },
          [tr('status.open', 'Open'), this._count('open')]
        ),
        -22
      );

      items.add(
        'support-assigned-to-me',
        m(
          LinkButton,
          {
            href: app.route('linkrobins-support.index', { q: 'assigned:me -is:closed' }),
            icon: 'fas fa-user-check',
            active: isIndex && q === 'assigned:me -is:closed',
          },
          [tr('index.filter_assigned_to_me', 'Assigned to me'), this._count('assigned_to_me')]
        ),
        -23
      );

      items.add(
        'support-unassigned',
        m(
          LinkButton,
          {
            href: app.route('linkrobins-support.index', { q: 'is:unassigned -is:closed' }),
            icon: 'fas fa-user-slash',
            active: isIndex && q === 'is:unassigned -is:closed',
          },
          [tr('index.filter_unassigned', 'Unassigned'), this._count('unassigned')]
        ),
        -24
      );

      items.add(
        'support-closed',
        m(
          LinkButton,
          {
            href: app.route('linkrobins-support.index', { q: 'is:closed' }),
            icon: 'fas fa-times-circle',
            active: isIndex && q === 'is:closed',
          },
          [tr('status.closed', 'Closed')]
        ),
        -25
      );

      items.add(
        'support-stats',
        m(
          Button,
          {
            icon: 'fas fa-chart-bar',
            className: 'LinkButton LinkRobinsSupport-statsLink',
            onclick: () => app.modal.show(SupportStatsModal),
          },
          tr('stats.title', 'Support stats')
        ),
        -30
      );
    }

    return items;
  }

  _currentLabel(): string {
    if (app.current.get('routeName') === 'linkrobins-support.search') {
      return tr('index.search_tickets_title', 'Search tickets');
    }
    const q = (this.attrs && typeof this.attrs.query === 'string' ? this.attrs.query : '').trim();
    if (!q || q === 'is:mine') return tr('index.my_tickets', 'My tickets');
    if (q === 'is:open') return tr('status.open', 'Open');
    if (q === 'assigned:me -is:closed') return tr('index.filter_assigned_to_me', 'Assigned to me');
    if (q === 'is:unassigned -is:closed') return tr('index.filter_unassigned', 'Unassigned');
    if (q === 'is:closed') return tr('status.closed', 'Closed');
    return tr('nav', 'Support');
  }

  _count(filterId: string) {
    const key = COUNT_FOR_FILTER[filterId];
    const n = key ? supportCount(key) : 0;
    if (!n) return null;
    return m('span', { className: 'LinkRobinsSupport-navCount' + (filterId === 'mine' ? ' is-unread' : '') }, n > 99 ? '99+' : String(n));
  }

  forumNavItems() {
    let items;
    try {
      items = super.navItems();
    } catch (e) {
      console.warn('[linkrobins/support] super.navItems() threw, falling back:', e);
      items = new ItemList();
    }
    if (!items) return new ItemList();
    try {
      const all = (items as any)._items || {};
      Object.keys(all).forEach((key) => {
        if (key === 'moreTags' || key === 'separator' || /^tag\d+$/.test(key)) {
          if (typeof items.remove === 'function') items.remove(key);
        }
      });
    } catch (e) {}
    return items;
  }
}
