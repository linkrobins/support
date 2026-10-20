import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import GlobalSearch from 'flarum/forum/components/GlobalSearch';
import GlobalSearchState from 'flarum/forum/states/GlobalSearchState';
import ItemList from 'flarum/common/utils/ItemList';
import extractText from 'flarum/common/utils/extractText';
import { tr } from './utils/translate';
import { canHandleSupportTickets } from './utils/permissions';
import { SUPPORT_TICKETS_RESOURCE } from './query/ticketGambits';
import SupportTicketsSearchSource from './query/SupportTicketsSearchSource';
import SupportGambitsAutocomplete from './query/SupportGambitsAutocomplete';
import type { GlobalSearchSource } from 'flarum/common/components/AbstractGlobalSearch';

const STANDARD_QUEUES = ['is:mine', 'is:open', 'assigned:me -is:closed', 'is:unassigned -is:closed', 'is:closed'];

export default function addSupportSearch() {
  // Override search sources when on any support desk route
  override(GlobalSearch.prototype, 'sourceItems', function (this: any, original) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      this.attrs.label = extractText(tr('index.search_placeholder', 'Search tickets'));
      const items = new ItemList<GlobalSearchSource>();
      items.add('tickets', new SupportTicketsSearchSource());
      return items;
    }
    this.attrs.label = app.translator.trans('core.forum.header.search_placeholder', {}, true);
    return original();
  });

  // Scope active search queries in header to the dedicated search page only
  override(GlobalSearchState.prototype, 'getInitialSearch', function (original) {
    if (app.current.get('routeName') === 'linkrobins-support.search') {
      const q = m.route.param('q');
      return (typeof q === 'string' && q.trim()) || '';
    }
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      return '';
    }
    return original();
  });

  // Automatically select support tickets source when on support routes
  override('flarum/common/components/SearchModal' as any, 'defaultActiveSource', function (original: any) {
    const orig = original();
    if (!orig && app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      return SUPPORT_TICKETS_RESOURCE;
    }
    return orig;
  });

  // Customize lazy-loaded SearchModal when invoked on support desk routes
  override('flarum/common/components/SearchModal' as any, 'title', function (original: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      return tr('index.search_tickets_title', 'Search tickets');
    }
    return original();
  });

  extend('flarum/common/components/SearchModal' as any, 'tabItems', function (this: any, items: ItemList<any>) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.') && this.sources?.length <= 1) {
      items.remove('tickets');
      items.remove('linkrobins-support-tickets');
    }
  });

  // Enhanced gambits autocomplete for support tickets with full value suggestions and hints
  override('flarum/common/components/SearchModal' as any, 'gambits', function (this: any, original: any) {
    if (this.activeSource()?.resource === SUPPORT_TICKETS_RESOURCE) {
      if (
        !this.gambitsAutocomplete[SUPPORT_TICKETS_RESOURCE] ||
        !(this.gambitsAutocomplete[SUPPORT_TICKETS_RESOURCE] instanceof SupportGambitsAutocomplete)
      ) {
        this.gambitsAutocomplete[SUPPORT_TICKETS_RESOURCE] = new SupportGambitsAutocomplete(
          SUPPORT_TICKETS_RESOURCE,
          () => this.inputElement(),
          (val: string) => {
            this.query(val);
            const input = this.inputElement && this.inputElement()[0];
            if (input) {
              input.value = val;
            }
          },
          (val: string) => {
            this.search(val);
            m.redraw();
          }
        );
      }
      return this.gambitsAutocomplete[SUPPORT_TICKETS_RESOURCE].suggestions(this.query());
    }
    return original();
  });

  override('flarum/common/components/SearchModal' as any, 'selectResult', function (this: any, original: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      if (this.searchTimeout) clearTimeout(this.searchTimeout);

      const q = this.query && this.query();
      const trimmed = q ? q.trim() : '';

      const item = this.getItem(this.index);
      const isResult = !!item.attr('data-id');
      let selectedUrl: string | null = null;

      if (isResult) {
        const id = item.attr('data-id');
        selectedUrl = (id && this.activeSource().gotoItem(id as string)) || null;
      }

      if (!selectedUrl && item.find('a').length) {
        selectedUrl = item.find('a').attr('href') || null;
      }

      if (selectedUrl) {
        app.modal.close();
        m.route.set(selectedUrl);
        return;
      }

      // If user explicitly navigated to a gambit suggestion button with arrow keys, click it
      if (this._userNavigated && item.find('button').length) {
        this._userNavigated = false;
        item.find('button')[0].click();
        return;
      }

      // If no preview item was loaded/selected yet, immediately execute full-page search
      if (trimmed) {
        app.modal.close();
        m.route.set(app.route('linkrobins-support.search', { q: trimmed }));
        return;
      }

      return;
    }

    return original();
  });

  override('flarum/common/components/SearchModal' as any, 'onsubmit', function (this: any, original: any, e: any) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      this.selectResult();
      return;
    }
    return original(e);
  });

  // Populate default filters for support tickets on modal initialization
  extend('flarum/common/components/SearchModal' as any, 'defaultFilters', function (this: any, filters: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      filters[SUPPORT_TICKETS_RESOURCE] ||= {};
      const routeName = app.current.get('routeName');
      if (routeName === 'linkrobins-support.show') {
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

  // Pre-fill gambits according to the active support desk view/page
  override('flarum/common/components/SearchModal' as any, 'prefill', function (this: any, original: any, value: string) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      const routeName = app.current.get('routeName');

      if (routeName === 'linkrobins-support.search') {
        const qParam = m.route.param('q');
        return (typeof qParam === 'string' && qParam.trim()) || value || '';
      }

      const trimmed = value && value.trim();
      if (trimmed && !STANDARD_QUEUES.includes(trimmed)) {
        return trimmed;
      }

      if (routeName === 'linkrobins-support.index') {
        const currentQueue = (m.route.param('q') || app.current.get('query') || '').trim();
        if (currentQueue) {
          return currentQueue;
        }

        if (canHandleSupportTickets()) {
          const pref = app.session?.user?.preferences()?.linkrobinsSupportStaffDefaultView;
          return typeof pref === 'string' && pref.trim() ? pref.trim() : 'is:open';
        }
        return 'is:mine';
      }

      if (routeName === 'linkrobins-support.show') {
        const ticketId = m.route.param('id');
        const ticket = app.current.get('ticket') || (ticketId ? app.store.getById('linkrobins-support-tickets', ticketId) : null);
        const cat = ticket && typeof ticket.category === 'function' ? ticket.category() : null;
        const slug = cat && typeof cat.slug === 'function' ? cat.slug() : null;
        if (slug) {
          return `category:${slug}`;
        }
      }

      if (routeName === 'linkrobins-support.compose') {
        const catParam = m.route.param('category') || app.current.get('category');
        if (typeof catParam === 'string' && catParam.trim()) {
          return `category:${catParam.trim()}`;
        }
      }
    }

    return original(value);
  });

  // Track initial query and keyboard navigation state on modal initialization
  extend('flarum/common/components/SearchModal' as any, 'oninit', function (this: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      this._supportInitialQuery = this.query && this.query();
      this._userNavigated = false;
    }
  });

  // Prepare input with trailing space, track key events, and trigger search on mount
  extend('flarum/common/components/SearchModal' as any, 'oncreate', function (this: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.')) {
      this._userNavigated = false;
      const $input = this.inputElement && this.inputElement();
      if ($input && $input.length) {
        $input.on('keydown', (e: any) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            this._userNavigated = true;
          } else if (e.key !== 'Enter') {
            this._userNavigated = false;
          }
        });
        $input.on('input', () => {
          this._userNavigated = false;
        });
      }

      const q = this.query && this.query();
      if (q && q.trim()) {
        const val = q.endsWith(' ') ? q : q.trim() + ' ';
        this.query(val);
        const input = this.inputElement && this.inputElement()[0];
        if (input) {
          input.value = val;
          try {
            input.focus();
            input.setSelectionRange(val.length, val.length);
          } catch (e) {}
        }
        this.search(val.trim());
      }
    }
  });

  // Clear automatic .active highlight on open unless user intentionally pressed arrow keys
  extend('flarum/common/components/SearchModal' as any, 'onupdate', function (this: any) {
    if (app.current.get('routeName')?.startsWith('linkrobins-support.') && !this._userNavigated) {
      if (typeof this.selectableItems === 'function') {
        this.selectableItems().removeClass('active');
      }
    }
  });

  // Reset header search state when dismissed on non-search pages
  extend('flarum/common/components/SearchModal' as any, 'onremove', function (this: any) {
    const routeName = app.current.get('routeName');
    if (routeName?.startsWith('linkrobins-support.') && routeName !== 'linkrobins-support.search') {
      const q = this.query && this.query();
      if (!q?.trim() || q.trim() === this._supportInitialQuery?.trim()) {
        app.search.state.setValue('');
      }
    }
  });
}
