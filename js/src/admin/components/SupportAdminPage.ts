import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import CategoryEditorModal from './CategoryEditorModal';
import { tx, showError, loadCategoriesList, deleteCategory } from '../utils';

// API maximum page size for the user list.
const BANNED_PAGE_LIMIT = 100;

function settingsGet(key: string, fallback: string): any {
  try {
    const v = app.data && app.data.settings && app.data.settings[key];
    return v === undefined || v === null || v === '' ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export default class SupportAdminPage extends ExtensionPage {
  activeTab = 'categories';
  categories: any[] = [];
  loadingCats = true;
  catError: any = null;
  bannedUsers: any[] | undefined = undefined;
  bannedLoading = false;
  bannedHasMore = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.activeTab = 'categories';
    this.categories = [];
    this.loadingCats = true;
    this.catError = null;
    this._loadCategories();
  }

  _loadCategories() {
    this.loadingCats = true;
    m.redraw();
    loadCategoriesList()
      .then((cats: any[]) => {
        this.categories = cats || [];
        this.loadingCats = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.catError = err;
        this.loadingCats = false;
        console.error('[linkrobins/support] categories load failed:', err);
        m.redraw();
      });
  }

  content() {
    return m('div', { className: 'container LinkRobinsSupportAdmin' }, [
      this._renderTabs(),
      this.activeTab === 'categories' ? this._renderCategoriesTab() : null,
      this.activeTab === 'settings' ? this._renderSettingsTab() : null,
      this.activeTab === 'appealBans' ? this._renderAppealBansTab() : null,
    ]);
  }

  _renderTabs() {
    const tabs = [
      { id: 'categories', labelKey: 'linkrobins-support.admin.nav.categories' },
      { id: 'settings', labelKey: 'linkrobins-support.admin.nav.rate_limits' },
      { id: 'appealBans', labelKey: 'linkrobins-support.admin.nav.appeal_bans' },
    ];
    return m(
      'div',
      { className: 'LinkRobinsSupportAdmin-tabs' },
      tabs.map((tab) =>
        m(
          'button',
          {
            type: 'button',
            className: 'LinkRobinsSupportAdmin-tab' + (this.activeTab === tab.id ? ' is-active' : ''),
            onclick: () => {
              this.activeTab = tab.id;
            },
          },
          tx(tab.labelKey)
        )
      )
    );
  }

  _renderCategoriesTab() {
    return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
      m('div', { className: 'LinkRobinsSupportAdmin-sectionHeader' }, [
        m('div', null, [
          m('h3', null, tx('linkrobins-support.admin.categories.heading')),
          m('p', { className: 'helpText' }, tx('linkrobins-support.admin.categories.intro')),
        ]),
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--primary',
            onclick: () => {
              this._openEditor(null);
            },
          },
          [m('i', { className: 'fas fa-plus' }), ' ' + tx('linkrobins-support.admin.categories.new_button')]
        ),
      ]),
      this.catError
        ? m('div', { className: 'Alert Alert--danger' }, tx('linkrobins-support.admin.category_editor.error_load'))
        : null,
      this.loadingCats
        ? m(LoadingIndicator)
        : this.categories.length === 0
        ? m('div', { className: 'LinkRobinsSupportAdmin-empty' }, tx('linkrobins-support.admin.categories.empty'))
        : m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
            m(
              'thead',
              null,
              m('tr', null, [
                m('th', null, tx('linkrobins-support.admin.categories.column_name')),
                m('th', null, tx('linkrobins-support.admin.categories.column_slug')),
                m('th', null, tx('linkrobins-support.admin.categories.column_type')),
                m('th', null, tx('linkrobins-support.admin.categories.column_tickets')),
                m('th', null, ''),
              ])
            ),
            m(
              'tbody',
              null,
              this.categories.map((c: any) =>
                m('tr', { key: 'cat-' + c.id() }, [
                  m('td', null, [
                    c.icon()
                      ? m('i', { className: c.icon(), style: c.color() ? 'color: ' + c.color() : '' })
                      : null,
                    ' ',
                    m('strong', null, c.name()),
                  ]),
                  m('td', { className: 'LinkRobinsSupportAdmin-mono' }, c.slug()),
                  m(
                    'td',
                    null,
                    c.isAppeal()
                      ? m(
                          'span',
                          { className: 'LinkRobinsSupportAdmin-tag is-appeal' },
                          tx('linkrobins-support.admin.categories.appeal_badge')
                        )
                      : tx('linkrobins-support.admin.categories.general_badge')
                  ),
                  m('td', null, c.ticketCount() || 0),
                  m('td', { className: 'LinkRobinsSupportAdmin-actions' }, [
                    m(
                      'button',
                      {
                        type: 'button',
                        className: 'Button Button--icon',
                        title: tx('linkrobins-support.admin.categories.edit_button'),
                        onclick: () => {
                          this._openEditor(c);
                        },
                      },
                      m('i', { className: 'fas fa-pencil-alt' })
                    ),
                    m(
                      'button',
                      {
                        type: 'button',
                        className: 'Button Button--icon LinkRobinsSupportAdmin-danger',
                        title: tx('linkrobins-support.admin.categories.delete_button'),
                        onclick: () => {
                          this._deleteCategory(c);
                        },
                      },
                      m('i', { className: 'fas fa-trash' })
                    ),
                  ]),
                ])
              )
            ),
          ]),
    ]);
  }

  _openEditor(category: any) {
    if (!app.modal) return;
    app.modal.show(CategoryEditorModal, {
      category,
      onSaved: () => {
        this._loadCategories();
      },
    });
  }

  _deleteCategory(cat: any) {
    const name = cat.name() || tx('linkrobins-support.admin.categories.this_category');
    const count = cat.ticketCount() || 0;
    const warning =
      count > 0
        ? tx('linkrobins-support.admin.categories.delete_confirm_with_tickets', { count })
        : tx('linkrobins-support.admin.categories.delete_confirm_named', { name });
    try {
      if (!window.confirm(warning)) return;
    } catch (e) {}

    deleteCategory(cat)
      .then(() => {
        this._loadCategories();
      })
      .catch((err: any) => {
        console.error('[linkrobins/support] delete category failed:', err);
        showError(tx('linkrobins-support.admin.category_editor.error_delete'));
      });
  }

  // --- Settings tab ---

  _renderSettingsTab() {
    const fields = [
      {
        key: 'linkrobins-support.appeal_limit_per_window',
        labelKey: 'linkrobins-support.admin.rate_limits.max_appeals_per_window',
        helpKey: 'linkrobins-support.admin.rate_limits.max_appeals_per_window_help',
        min: 1,
        defaultValue: '3',
      },
      {
        key: 'linkrobins-support.appeal_window_days',
        labelKey: 'linkrobins-support.admin.rate_limits.appeal_window_days',
        helpKey: 'linkrobins-support.admin.rate_limits.appeal_window_days_help',
        min: 1,
        defaultValue: '30',
      },
      {
        key: 'linkrobins-support.appeal_max_concurrent_open',
        labelKey: 'linkrobins-support.admin.rate_limits.max_concurrent_appeals',
        helpKey: 'linkrobins-support.admin.rate_limits.max_concurrent_appeals_help',
        min: 0,
        defaultValue: '1',
      },
      {
        key: 'linkrobins-support.general_limit_per_window',
        labelKey: 'linkrobins-support.admin.rate_limits.max_general_per_window',
        helpKey: 'linkrobins-support.admin.rate_limits.max_general_per_window_help',
        min: 1,
        defaultValue: '10',
      },
      {
        key: 'linkrobins-support.general_window_hours',
        labelKey: 'linkrobins-support.admin.rate_limits.general_window_hours',
        helpKey: 'linkrobins-support.admin.rate_limits.general_window_hours_help',
        min: 1,
        defaultValue: '24',
      },
    ];

    return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
      m(
        'div',
        { className: 'LinkRobinsSupportAdmin-sectionHeader' },
        m('div', null, [
          m('h3', null, tx('linkrobins-support.admin.rate_limits.heading')),
          m('p', { className: 'helpText' }, tx('linkrobins-support.admin.rate_limits.intro')),
        ])
      ),
      fields.map((f) =>
        m('div', { className: 'Form-group', key: f.key }, [
          m('label', null, tx(f.labelKey)),
          m('input', {
            type: 'number',
            className: 'FormControl',
            min: f.min,
            value: settingsGet(f.key, f.defaultValue),
            oninput: (e: any) => {
              this.setting(f.key)(e.target.value);
            },
          }),
          m('div', { className: 'helpText' }, tx(f.helpKey)),
        ])
      ),
      m('div', { className: 'Form-group' }, this.submitButton()),
    ]);
  }

  _renderAppealBansTab() {
    if (this.bannedUsers === undefined) {
      this.bannedUsers = [];
      this.bannedLoading = false;
      this._loadBannedUsers(false);
    }

    return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
      m(
        'div',
        { className: 'LinkRobinsSupportAdmin-sectionHeader' },
        m('div', null, [
          m('h3', null, tx('linkrobins-support.admin.appeal_bans.heading_alt')),
          m('p', { className: 'helpText' }, tx('linkrobins-support.admin.appeal_bans.intro')),
        ])
      ),

      m('div', { className: 'LinkRobinsSupportAdmin-section', style: 'margin-top:18px;' }, [
        m('h4', null, tx('linkrobins-support.admin.appeal_bans.banned_heading')),
        this.bannedLoading && (!this.bannedUsers || this.bannedUsers.length === 0)
          ? m(LoadingIndicator)
          : this.bannedUsers && this.bannedUsers.length > 0
          ? [this._renderBannedTable(this.bannedUsers), this._renderLoadMore()]
          : m('div', { className: 'LinkRobinsSupportAdmin-empty' }, tx('linkrobins-support.admin.appeal_bans.banned_empty')),
      ]),
    ]);
  }

  // Read-only list of currently appeal-banned users. To change a user's status,
  // open their profile (the username links there) and use the moderation
  // controls dropdown.
  _renderBannedTable(users: any[]) {
    const base = (app.forum && app.forum.attribute && app.forum.attribute('baseUrl')) || '';
    return m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
      m(
        'thead',
        null,
        m('tr', null, [
          m('th', null, tx('linkrobins-support.admin.appeal_bans.column_username')),
          m('th', null, tx('linkrobins-support.admin.appeal_bans.column_email')),
        ])
      ),
      m(
        'tbody',
        null,
        users.map((u: any) =>
          m('tr', { key: u.id() }, [
            m(
              'td',
              null,
              m(
                'a',
                { href: base + '/u/' + encodeURIComponent(u.username() || ''), target: '_blank' },
                u.username() || '?'
              )
            ),
            m('td', { className: 'LinkRobinsSupportAdmin-mono' }, u.email() || '—'),
          ])
        )
      ),
    ]);
  }

  _renderLoadMore() {
    if (!this.bannedHasMore) return null;
    return m(
      'div',
      { className: 'LinkRobinsSupportAdmin-loadMore', style: 'margin-top:10px;' },
      m(
        'button',
        {
          type: 'button',
          className: 'Button',
          disabled: this.bannedLoading,
          onclick: () => {
            this._loadBannedUsers(true);
          },
        },
        this.bannedLoading
          ? tx('linkrobins-support.admin.common.loading')
          : tx('linkrobins-support.admin.appeal_bans.load_more')
      )
    );
  }

  // Server-side filter (AppealBannedFilter) returns appeal-banned users. Paged
  // at the API max of 100, with a Load-more so forums with many banned users
  // aren't silently truncated.
  _loadBannedUsers(append: boolean) {
    this.bannedLoading = true;
    if (!append) {
      this.bannedUsers = [];
      this.bannedHasMore = false;
    }
    m.redraw();

    const offset = append && this.bannedUsers ? this.bannedUsers.length : 0;

    app.store
      .find('users', {
        filter: { supportAppealBanned: 1 },
        page: { limit: BANNED_PAGE_LIMIT, offset },
        sort: 'username',
      })
      .then((users: any) => {
        const list = users || [];
        this.bannedUsers = append && this.bannedUsers ? this.bannedUsers.concat(list) : list;
        // More pages remain if the response advertises a next link.
        this.bannedHasMore = !!(users && users.payload && users.payload.links && users.payload.links.next);
        this.bannedLoading = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.bannedLoading = false;
        console.error('[linkrobins/support] banned-users load failed:', err);
        m.redraw();
      });
  }
}
