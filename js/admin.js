'use strict';

(function () {

    // --- i18n helpers ---------------------------------------------------
    //
    // See forum.js for the rationale. t() returns whatever the translator
    // returns (vdom or string); tx() always returns a plain string for
    // attributes, alerts, and confirms.
    function t(key, params) {
        try {
            if (app && app.translator && typeof app.translator.trans === 'function') {
                return app.translator.trans(key, params || {});
            }
        } catch (e) {}
        return key;
    }

    function tx(key, params) {
        try {
            if (app && app.translator && typeof app.translator.trans === 'function') {
                return app.translator.trans(key, params || {}, true);
            }
        } catch (e) {}
        return key;
    }

    // --- Helpers --------------------------------------------------------

    function apiUrl() {
        return app.forum.attribute('apiUrl');
    }

    function showError(message) {
        try {
            if (app && app.alerts && typeof app.alerts.show === 'function') {
                app.alerts.show({ type: 'error' }, message);
                return;
            }
        } catch (e) {}
        try { alert(message); } catch (e) {}
    }

    function settingsGet(key, fallback) {
        try {
            var v = app.data && app.data.settings && app.data.settings[key];
            return (v === undefined || v === null || v === '') ? fallback : v;
        } catch (e) { return fallback; }
    }

    function settingsSet(key, value) {
        try {
            if (app.data && app.data.settings) {
                app.data.settings[key] = value;
            }
        } catch (e) {}
    }

    function saveSettings(payload) {
        return app.request({
            method: 'POST',
            url:    apiUrl() + '/settings',
            body:   payload,
        });
    }

    function fetchCategoriesList() {
        return app.request({
            method: 'GET',
            url:    apiUrl() + '/linkrobins-support-categories',
            params: { sort: 'position', page: { limit: 100 } },
        });
    }

    function createCategory(attrs) {
        return app.request({
            method: 'POST',
            url:    apiUrl() + '/linkrobins-support-categories',
            body:   {
                data: {
                    type: 'linkrobins-support-categories',
                    attributes: attrs,
                },
            },
        });
    }

    function updateCategory(id, attrs) {
        return app.request({
            method: 'PATCH',
            url:    apiUrl() + '/linkrobins-support-categories/' + encodeURIComponent(id),
            body:   {
                data: {
                    type: 'linkrobins-support-categories',
                    id:   String(id),
                    attributes: attrs,
                },
            },
        });
    }

    function deleteCategoryRequest(id) {
        return app.request({
            method: 'DELETE',
            url:    apiUrl() + '/linkrobins-support-categories/' + encodeURIComponent(id),
        });
    }

    // --- init -----------------------------------------------------------

    function init() {
        var ExtensionPage = null;
        var Modal         = null;
        var Button        = null;
        var Switch        = null;
        var LoadingIndicator = null;
        try { ExtensionPage    = flarum.reg.get('core', 'admin/components/ExtensionPage'); } catch (e) {}
        try { Modal            = flarum.reg.get('core', 'common/components/Modal'); }         catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }        catch (e) {}
        try { Switch           = flarum.reg.get('core', 'common/components/Switch'); }        catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}

        if (!ExtensionPage) {
            console.error('[linkrobins/support] ExtensionPage not available; aborting.');
            return;
        }

        var CategoryEditorModal = Modal ? makeCategoryEditorModal(Modal) : null;
        window.LinkRobinsSupportCategoryEditorModal = CategoryEditorModal;

        var SupportAdminPage = makeSupportAdminPage(ExtensionPage, LoadingIndicator);

        if (!app.registry || typeof app.registry.for !== 'function') {
            console.warn('[linkrobins/support] app.registry not available');
            return;
        }
        app.registry
            .for('linkrobins-support')
            .registerPage(SupportAdminPage);

        try {
            if (typeof app.registry.registerPermission === 'function') {
                app.registry.registerPermission({
                    permission: 'linkrobins-support.handle_tickets',
                    icon:       'fas fa-life-ring',
                    label:      tx('linkrobins-support.admin.permissions.handle_tickets'),
                }, 'moderate', 95);
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not register permission:', e);
        }
    }

    // --- Admin page -----------------------------------------------------

    function makeSupportAdminPage(ExtensionPage, LoadingIndicator) {
        return class SupportAdminPage extends ExtensionPage {
            oninit(vnode) {
                super.oninit(vnode);
                this.activeTab    = 'categories';
                this.categories   = [];
                this.loadingCats  = true;
                this.catError     = null;
                this._loadCategories();
            }

            _loadCategories() {
                var self = this;
                self.loadingCats = true;
                m.redraw();
                fetchCategoriesList()
                    .then(function (resp) {
                        self.categories  = (resp && resp.data) || [];
                        self.loadingCats = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.catError    = err;
                        self.loadingCats = false;
                        console.error('[linkrobins/support] categories load failed:', err);
                        m.redraw();
                    });
            }

            content() {
                var self = this;
                return m('div', { className: 'container LinkRobinsSupportAdmin' }, [
                    this._renderTabs(),
                    this.activeTab === 'categories'  ? this._renderCategoriesTab()  : null,
                    this.activeTab === 'settings'    ? this._renderSettingsTab()    : null,
                    this.activeTab === 'appealBans'  ? this._renderAppealBansTab()  : null,
                ]);
            }

            _renderTabs() {
                var self = this;
                var tabs = [
                    { id: 'categories', labelKey: 'linkrobins-support.admin.nav.categories' },
                    { id: 'settings',   labelKey: 'linkrobins-support.admin.nav.rate_limits' },
                    { id: 'appealBans', labelKey: 'linkrobins-support.admin.nav.appeal_bans' },
                ];
                return m('div', { className: 'LinkRobinsSupportAdmin-tabs' },
                    tabs.map(function (tab) {
                        return m('button', {
                            type:      'button',
                            className: 'LinkRobinsSupportAdmin-tab'
                                + (self.activeTab === tab.id ? ' is-active' : ''),
                            onclick:   function () { self.activeTab = tab.id; },
                        }, tx(tab.labelKey));
                    })
                );
            }

            _renderCategoriesTab() {
                var self = this;
                return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
                    m('div', { className: 'LinkRobinsSupportAdmin-sectionHeader' }, [
                        m('div', null, [
                            m('h3', null, tx('linkrobins-support.admin.categories.heading')),
                            m('p', { className: 'helpText' },
                                tx('linkrobins-support.admin.categories.intro')),
                        ]),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            onclick:   function () { self._openEditor(null); },
                        }, [m('i', { className: 'fas fa-plus' }), ' ' + tx('linkrobins-support.admin.categories.new_button')]),
                    ]),
                    self.catError ? m('div', { className: 'Alert Alert--danger' },
                        tx('linkrobins-support.admin.category_editor.error_load')) : null,
                    self.loadingCats ? (
                        LoadingIndicator ? m(LoadingIndicator) : m('div', null, tx('linkrobins-support.admin.common.loading'))
                    ) : (
                        self.categories.length === 0
                            ? m('div', { className: 'LinkRobinsSupportAdmin-empty' },
                                tx('linkrobins-support.admin.categories.empty'))
                            : m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
                                m('thead', null, m('tr', null, [
                                    m('th', null, tx('linkrobins-support.admin.categories.column_name')),
                                    m('th', null, tx('linkrobins-support.admin.categories.column_slug')),
                                    m('th', null, tx('linkrobins-support.admin.categories.column_type')),
                                    m('th', null, tx('linkrobins-support.admin.categories.column_tickets')),
                                    m('th', null, ''),
                                ])),
                                m('tbody', null, self.categories.map(function (c) {
                                    var attr = c.attributes || {};
                                    return m('tr', { key: 'cat-' + c.id }, [
                                        m('td', null, [
                                            attr.icon ? m('i', {
                                                className: attr.icon,
                                                style:     attr.color ? 'color: ' + attr.color : '',
                                            }) : null,
                                            ' ',
                                            m('strong', null, attr.name),
                                        ]),
                                        m('td', { className: 'LinkRobinsSupportAdmin-mono' }, attr.slug),
                                        m('td', null, attr.isAppeal ? m('span', {
                                            className: 'LinkRobinsSupportAdmin-tag is-appeal',
                                        }, tx('linkrobins-support.admin.categories.appeal_badge')) : tx('linkrobins-support.admin.categories.general_badge')),
                                        m('td', null, attr.ticketCount || 0),
                                        m('td', { className: 'LinkRobinsSupportAdmin-actions' }, [
                                            m('button', {
                                                type:      'button',
                                                className: 'Button Button--icon',
                                                title:     tx('linkrobins-support.admin.categories.edit_button'),
                                                onclick:   function () { self._openEditor(c); },
                                            }, m('i', { className: 'fas fa-pencil-alt' })),
                                            m('button', {
                                                type:      'button',
                                                className: 'Button Button--icon LinkRobinsSupportAdmin-danger',
                                                title:     tx('linkrobins-support.admin.categories.delete_button'),
                                                onclick:   function () { self._deleteCategory(c); },
                                            }, m('i', { className: 'fas fa-trash' })),
                                        ]),
                                    ]);
                                })),
                            ])
                    ),
                ]);
            }

            _openEditor(category) {
                var self = this;
                if (!window.LinkRobinsSupportCategoryEditorModal || !app.modal) return;
                app.modal.show(window.LinkRobinsSupportCategoryEditorModal, {
                    category: category,
                    onSaved:  function () { self._loadCategories(); },
                });
            }

            _deleteCategory(cat) {
                var self = this;
                var attr = cat.attributes || {};
                var name = attr.name || tx('linkrobins-support.admin.categories.this_category');
                var count = attr.ticketCount || 0;
                var warning = count > 0
                    ? tx('linkrobins-support.admin.categories.delete_confirm_with_tickets', { count: count })
                    : tx('linkrobins-support.admin.categories.delete_confirm_named', { name: name });
                try {
                    if (!window.confirm(warning)) return;
                } catch (e) {}

                deleteCategoryRequest(cat.id)
                    .then(function () { self._loadCategories(); })
                    .catch(function (err) {
                        console.error('[linkrobins/support] delete category failed:', err);
                        showError(tx('linkrobins-support.admin.category_editor.error_delete'));
                    });
            }

            // --- Settings tab ---

            _renderSettingsTab() {
                var self = this;
                var fields = [
                    {
                        key:   'linkrobins-support.appeal_limit_per_window',
                        labelKey: 'linkrobins-support.admin.rate_limits.max_appeals_per_window',
                        helpKey:  'linkrobins-support.admin.rate_limits.max_appeals_per_window_help',
                        type:  'number', min: 1,
                        defaultValue: '3',
                    },
                    {
                        key:   'linkrobins-support.appeal_window_days',
                        labelKey: 'linkrobins-support.admin.rate_limits.appeal_window_days',
                        helpKey:  'linkrobins-support.admin.rate_limits.appeal_window_days_help',
                        type:  'number', min: 1,
                        defaultValue: '30',
                    },
                    {
                        key:   'linkrobins-support.appeal_max_concurrent_open',
                        labelKey: 'linkrobins-support.admin.rate_limits.max_concurrent_appeals',
                        helpKey:  'linkrobins-support.admin.rate_limits.max_concurrent_appeals_help',
                        type:  'number', min: 0,
                        defaultValue: '1',
                    },
                    {
                        key:   'linkrobins-support.general_limit_per_window',
                        labelKey: 'linkrobins-support.admin.rate_limits.max_general_per_window',
                        helpKey:  'linkrobins-support.admin.rate_limits.max_general_per_window_help',
                        type:  'number', min: 1,
                        defaultValue: '10',
                    },
                    {
                        key:   'linkrobins-support.general_window_hours',
                        labelKey: 'linkrobins-support.admin.rate_limits.general_window_hours',
                        helpKey:  'linkrobins-support.admin.rate_limits.general_window_hours_help',
                        type:  'number', min: 1,
                        defaultValue: '24',
                    },
                ];

                return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
                    m('div', { className: 'LinkRobinsSupportAdmin-sectionHeader' },
                        m('div', null, [
                            m('h3', null, tx('linkrobins-support.admin.rate_limits.heading')),
                            m('p', { className: 'helpText' },
                                tx('linkrobins-support.admin.rate_limits.intro')),
                        ])
                    ),
                    fields.map(function (f) {
                        return m('div', { className: 'Form-group', key: f.key }, [
                            m('label', null, tx(f.labelKey)),
                            m('input', {
                                type:      f.type,
                                className: 'FormControl',
                                min:       f.min,
                                value:     settingsGet(f.key, f.defaultValue),
                                oninput:   function (e) {
                                    var v = e.target.value;
                                    self.setting(f.key)(v);
                                },
                            }),
                            m('div', { className: 'helpText' }, tx(f.helpKey)),
                        ]);
                    }),
                    m('div', { className: 'Form-group' },
                        this.submitButton()
                    ),
                ]);
            }

            _renderAppealBansTab() {
                var self = this;
                if (this.appealQuery === undefined) {
                    this.appealQuery   = '';
                    this.appealResults = [];
                    this.appealLoading = false;
                    this.appealError   = null;
                    // Load currently-banned users on first paint.
                    this._loadBannedUsers();
                }

                return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
                    m('div', { className: 'LinkRobinsSupportAdmin-sectionHeader' },
                        m('div', null, [
                            m('h3', null, tx('linkrobins-support.admin.appeal_bans.heading_alt')),
                            m('p', { className: 'helpText' },
                                tx('linkrobins-support.admin.appeal_bans.intro')),
                        ])
                    ),

                    m('div', { className: 'Form-group LinkRobinsSupportAdmin-userSearch' }, [
                        m('label', null, tx('linkrobins-support.admin.appeal_bans.search_heading')),
                        m('div', { style: 'display:flex; gap:8px;' }, [
                            m('input', {
                                type:        'text',
                                className:   'FormControl',
                                placeholder: tx('linkrobins-support.admin.appeal_bans.search_placeholder'),
                                value:       this.appealQuery,
                                oninput:     function (e) { self.appealQuery = e.target.value; },
                                onkeydown:   function (e) {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        self._searchUsers();
                                    }
                                },
                            }),
                            m('button', {
                                type:      'button',
                                className: 'Button',
                                onclick:   function () { self._searchUsers(); },
                            }, tx('linkrobins-support.admin.appeal_bans.search_button')),
                        ]),
                        m('div', { className: 'helpText' },
                            tx('linkrobins-support.admin.appeal_bans.search_help')),
                    ]),

                    this.appealError ? m('div', { className: 'Alert Alert--danger' },
                        tx('linkrobins-support.admin.appeal_bans.search_error')) : null,

                    this.appealLoading
                        ? (LoadingIndicator ? m(LoadingIndicator) : m('div', null, tx('linkrobins-support.admin.common.loading')))
                        : null,

                    !this.appealLoading && this.appealResults.length > 0
                        ? m('div', { className: 'LinkRobinsSupportAdmin-section', style: 'margin-top:18px;' }, [
                            m('h4', null, tx('linkrobins-support.admin.appeal_bans.search_results_heading')),
                            this._renderUsersTable(this.appealResults, false),
                        ])
                        : null,

                    m('div', { className: 'LinkRobinsSupportAdmin-section', style: 'margin-top:24px;' }, [
                        m('h4', null, tx('linkrobins-support.admin.appeal_bans.banned_heading')),
                        this.bannedLoading
                            ? (LoadingIndicator ? m(LoadingIndicator) : m('div', null, tx('linkrobins-support.admin.common.loading')))
                            : (this.bannedUsers && this.bannedUsers.length > 0
                                ? this._renderUsersTable(this.bannedUsers, true)
                                : m('div', { className: 'LinkRobinsSupportAdmin-empty' },
                                    tx('linkrobins-support.admin.appeal_bans.banned_empty'))),
                    ]),
                ]);
            }

            _renderUsersTable(users, banned) {
                var self = this;
                return m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
                    m('thead', null, m('tr', null, [
                        m('th', null, tx('linkrobins-support.admin.appeal_bans.column_username')),
                        m('th', null, tx('linkrobins-support.admin.appeal_bans.column_email')),
                        m('th', { style: 'text-align:right;' }, tx('linkrobins-support.admin.appeal_bans.column_action')),
                    ])),
                    m('tbody', null,
                        users.map(function (u) {
                            var attr = u.attributes || {};
                            return m('tr', { key: u.id }, [
                                m('td', null, attr.username || '?'),
                                m('td', { className: 'LinkRobinsSupportAdmin-mono' },
                                    attr.email || '—'),
                                m('td', { style: 'text-align:right;' },
                                    m('button', {
                                        type:      'button',
                                        className: 'Button ' + (banned ? '' : 'Button--primary'),
                                        disabled:  !!u._pending,
                                        onclick:   function () {
                                            self._toggleBan(u, !banned);
                                        },
                                    }, u._pending
                                        ? tx('linkrobins-support.admin.appeal_bans.saving')
                                        : (banned
                                            ? tx('linkrobins-support.admin.appeal_bans.unban_button')
                                            : tx('linkrobins-support.admin.appeal_bans.ban_button')))),
                            ]);
                        })
                    ),
                ]);
            }

            _searchUsers() {
                var self = this;
                var q = (this.appealQuery || '').trim();
                if (!q) {
                    this.appealResults = [];
                    return;
                }
                self.appealLoading = true;
                self.appealError   = null;
                m.redraw();
                app.request({
                    method: 'GET',
                    url:    apiUrl() + '/users',
                    params: {
                        // Combine free-text search with the appeal-ban
                        // filter so already-banned users never appear in
                        // the results -- they're listed separately in the
                        // "currently banned" panel below.
                        filter: { q: q, supportAppealBanned: 0 },
                        page:   { limit: 25 },
                    },
                }).then(function (resp) {
                    self.appealResults = (resp && resp.data) || [];
                    self.appealLoading = false;
                    m.redraw();
                }).catch(function (err) {
                    self.appealError   = err;
                    self.appealLoading = false;
                    console.error('[linkrobins/support] user search failed:', err);
                    m.redraw();
                });
            }

            _loadBannedUsers() {
                var self = this;
                self.bannedLoading = true;
                self.bannedUsers   = [];
                m.redraw();
                // Server-side filter, registered by LinkRobins\Support\
                // Search\Filter\AppealBannedFilter. This returns *all*
                // appeal-banned users in one paginated response, rather
                // than fetching 200 random recent users and filtering
                // client-side (which would miss anyone who joined more
                // than 200 recent users ago).
                app.request({
                    method: 'GET',
                    url:    apiUrl() + '/users',
                    params: {
                        filter: { supportAppealBanned: 1 },
                        page:   { limit: 50 },
                        sort:   'username',
                    },
                }).then(function (resp) {
                    self.bannedUsers   = (resp && resp.data) || [];
                    self.bannedLoading = false;
                    m.redraw();
                }).catch(function (err) {
                    self.bannedLoading = false;
                    console.error('[linkrobins/support] banned-users load failed:', err);
                    m.redraw();
                });
            }

            _toggleBan(user, ban) {
                var self = this;
                user._pending = true;
                m.redraw();
                app.request({
                    method: 'PATCH',
                    url:    apiUrl() + '/users/' + encodeURIComponent(user.id),
                    body:   {
                        data: {
                            type:       'users',
                            id:         user.id,
                            attributes: { supportAppealBanned: ban },
                        },
                    },
                }).then(function () {
                    user._pending = false;
                    // Move the user between the two lists.
                    if (ban) {
                        // Add to banned list, remove from search results.
                        if (!user.attributes) user.attributes = {};
                        user.attributes.supportAppealBanned = true;
                        self.bannedUsers = (self.bannedUsers || []).concat([user]);
                        self.appealResults = (self.appealResults || []).filter(function (u) {
                            return u.id !== user.id;
                        });
                    } else {
                        user.attributes.supportAppealBanned = false;
                        self.bannedUsers = (self.bannedUsers || []).filter(function (u) {
                            return u.id !== user.id;
                        });
                    }
                    m.redraw();
                }).catch(function (err) {
                    user._pending = false;
                    console.error('[linkrobins/support] toggle ban failed:', err);
                    showError(tx('linkrobins-support.admin.appeal_bans.error_toggle'));
                    m.redraw();
                });
            }
        };
    }

    // --- Category editor modal ------------------------------------------

    function makeCategoryEditorModal(Modal) {
        return class CategoryEditorModal extends Modal {
            oninit(vnode) {
                super.oninit(vnode);
                var category = this.attrs && this.attrs.category;
                var attr = category ? (category.attributes || {}) : {};
                this.editId      = category ? category.id : null;
                this.name        = attr.name        || '';
                this.slug        = attr.slug        || '';
                this.description = attr.description || '';
                this.color       = attr.color       || '#07adcc';
                this.icon        = attr.icon        || 'fas fa-folder';
                this.position    = attr.position !== undefined ? attr.position : 0;
                this.isAppeal    = !!attr.isAppeal;
                this.saving      = false;
                this.error       = null;
            }

            className() {
                return 'LinkRobinsSupportCategoryEditorModal Modal--medium';
            }

            title() {
                return this.editId
                    ? tx('linkrobins-support.admin.category_editor.title_edit')
                    : tx('linkrobins-support.admin.category_editor.title_new');
            }

            content() {
                var self = this;
                return m('div', { className: 'Modal-body' }, [
                    self.error ? m('div', { className: 'Alert Alert--danger' },
                        self._errorMessage()) : null,

                    m('div', { className: 'Form-group' }, [
                        m('label', null, tx('linkrobins-support.admin.category_editor.field_name')),
                        m('input', {
                            type:      'text',
                            className: 'FormControl',
                            value:     self.name,
                            disabled:  self.saving,
                            oninput:   function (e) { self.name = e.target.value; },
                        }),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, tx('linkrobins-support.admin.category_editor.field_slug')),
                        m('input', {
                            type:        'text',
                            className:   'FormControl',
                            value:       self.slug,
                            placeholder: tx('linkrobins-support.admin.category_editor.field_slug_placeholder'),
                            disabled:    self.saving,
                            oninput:     function (e) { self.slug = e.target.value; },
                        }),
                        m('div', { className: 'helpText' },
                            tx('linkrobins-support.admin.category_editor.field_slug_help')),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, tx('linkrobins-support.admin.category_editor.field_description')),
                        m('textarea', {
                            className: 'FormControl',
                            rows:      3,
                            value:     self.description,
                            disabled:  self.saving,
                            oninput:   function (e) { self.description = e.target.value; },
                        }),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, tx('linkrobins-support.admin.category_editor.field_color')),
                        m('input', {
                            type:      'text',
                            className: 'FormControl',
                            value:     self.color,
                            disabled:  self.saving,
                            placeholder: '#07adcc',
                            oninput:   function (e) { self.color = e.target.value; },
                        }),
                        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_color_help')),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, tx('linkrobins-support.admin.category_editor.field_icon')),
                        m('input', {
                            type:      'text',
                            className: 'FormControl',
                            value:     self.icon,
                            disabled:  self.saving,
                            placeholder: 'fas fa-folder',
                            oninput:   function (e) { self.icon = e.target.value; },
                        }),
                        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_icon_help')),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, tx('linkrobins-support.admin.category_editor.field_position')),
                        m('input', {
                            type:      'number',
                            className: 'FormControl',
                            value:     self.position,
                            disabled:  self.saving,
                            oninput:   function (e) { self.position = parseInt(e.target.value, 10) || 0; },
                        }),
                        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_position_help')),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', { className: 'LinkRobinsSupportAdmin-checkbox' }, [
                            m('input', {
                                type:    'checkbox',
                                checked: self.isAppeal,
                                disabled: self.saving,
                                onchange: function (e) { self.isAppeal = !!e.target.checked; },
                            }),
                            ' ' + tx('linkrobins-support.admin.category_editor.field_is_appeal'),
                        ]),
                        m('div', { className: 'helpText' },
                            tx('linkrobins-support.admin.category_editor.field_is_appeal_help')),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  self.saving || !self.name.trim(),
                            onclick:   function () { self._save(); },
                        }, self.saving
                            ? tx('linkrobins-support.admin.category_editor.saving')
                            : (self.editId
                                ? tx('linkrobins-support.admin.category_editor.submit_update')
                                : tx('linkrobins-support.admin.category_editor.submit_create'))),
                    ]),
                ]);
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return tx('linkrobins-support.admin.common.unknown_error');
                try {
                    var errors = err.response && err.response.errors;
                    if (errors && errors[0]) {
                        return errors[0].detail || errors[0].title || tx('linkrobins-support.admin.rate_limits.error_save');
                    }
                } catch (e) {}
                return tx('linkrobins-support.admin.category_editor.error_save');
            }

            _save() {
                var self = this;
                self.saving = true;
                self.error  = null;
                m.redraw();

                var attrs = {
                    name:        self.name.trim(),
                    description: self.description,
                    color:       self.color,
                    icon:        self.icon,
                    position:    self.position,
                    isAppeal:    self.isAppeal,
                };
                if (self.slug && self.slug.trim()) {
                    attrs.slug = self.slug.trim();
                }

                var promise = self.editId
                    ? updateCategory(self.editId, attrs)
                    : createCategory(attrs);

                promise.then(function () {
                    self.saving = false;
                    try { if (self.attrs.onSaved) self.attrs.onSaved(); } catch (e) {}
                    try { app.modal.close(); } catch (e) {}
                }).catch(function (err) {
                    self.saving = false;
                    self.error  = err;
                    console.error('[linkrobins/support] save category failed:', err);
                    m.redraw();
                });
            }
        };
    }

    if (typeof app !== 'undefined' && app.initializers && typeof app.initializers.add === 'function') {
        app.initializers.add('linkrobins-support', init);
    }

})();

module.exports = {};
