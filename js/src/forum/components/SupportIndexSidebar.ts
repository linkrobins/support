import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import ItemList from 'flarum/common/utils/ItemList';
import { tr } from '../utils/translate';
import { basePath, BASE_PATH, safeNavigate } from '../utils/helpers';
import { canCreateSupportTicket, canHandleSupportTickets } from '../utils/permissions';
import { FILTER_OPTIONS, filterLabel, filterHrefFor } from '../utils/status';

export default class SupportIndexSidebar extends IndexSidebar {
  items() {
    const items = new ItemList();

    // "New ticket" primary button -- mirrors the blog's "Compose" button.
    if (canCreateSupportTicket()) {
      const newHref = basePath() + BASE_PATH + '/new';
      items.add(
        'newTicket',
        m(
          Button,
          {
            icon: 'fas fa-plus',
            className: 'Button Button--primary LinkRobinsSupport-newTicketButton',
            itemClassName: 'App-primaryControl',
            'aria-label': tr('index.new_ticket', 'New ticket'),
            title: tr('index.new_ticket_tooltip', 'Open a new support ticket'),
            onclick: (e: any) => {
              safeNavigate(newHref, e);
            },
          },
          tr('index.new_ticket', 'New ticket')
        ),
        110
      );
    }

    items.add(
      'nav',
      m(
        SelectDropdown,
        {
          buttonClassName: 'Button',
          className: 'App-titleControl',
          defaultLabel: tr('nav', 'Support'),
        },
        this.navItems().toArray()
      ),
      90
    );

    return items;
  }

  /**
   * The support filters, and nothing else.
   *
   * Deliberately NOT built on super.navItems(): subclassing IndexSidebar used
   * to inherit the forum's own navigation (All Discussions, Following, the
   * Tags block) into the support sidebar, which meant the support pages
   * advertised the forum rather than the tickets somebody came here for.
   * Starting from an empty list also means a tags or flags extension adding
   * itself to IndexSidebar cannot reappear here later.
   */
  navItems() {
    const items = new ItemList();

    const canHandle = canHandleSupportTickets();
    const currentFilter = this.attrs && Object.prototype.hasOwnProperty.call(this.attrs, 'activeFilter') ? this.attrs.activeFilter : 'mine'; // may be null (= nothing active)

    FILTER_OPTIONS.forEach((opt, i) => {
      if (opt.staffOnly && !canHandle) return;
      items.add(
        'support-filter-' + opt.id,
        m(
          LinkButton,
          {
            href: filterHrefFor(opt.id),
            icon: opt.icon,
            active: currentFilter === opt.id,
          },
          filterLabel(opt)
        ),
        -21 - i
      );
    });

    return items;
  }
}
