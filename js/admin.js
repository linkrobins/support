'use strict';

(function () {

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
                    label:      'Handle support tickets',
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
                    { id: 'categories', label: 'Categories' },
                    { id: 'settings',   label: 'Rate limits' },
                    { id: 'appealBans', label: 'Appeal bans' },
                ];
                return m('div', { className: 'LinkRobinsSupportAdmin-tabs' },
                    tabs.map(function (t) {
                        return m('button', {
                            type:      'button',
                            className: 'LinkRobinsSupportAdmin-tab'
                                + (self.activeTab === t.id ? ' is-active' : ''),
                            onclick:   function () { self.activeTab = t.id; },
                        }, t.label);
                    })
                );
            }

            _renderCategoriesTab() {
                var self = this;
                return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
                    m('div', { className: 'LinkRobinsSupportAdmin-sectionHeader' }, [
                        m('div', null, [
                            m('h3', null, 'Categories'),
                            m('p', { className: 'helpText' },
                                'Ticket categories users can pick from. Mark a category as "appeal" to apply the strict per-user appeal rate limits and let banned users file tickets in it.'),
                        ]),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            onclick:   function () { self._openEditor(null); },
                        }, [m('i', { className: 'fas fa-plus' }), ' New category']),
                    ]),
                    self.catError ? m('div', { className: 'Alert Alert--danger' },
                        'Could not load categories.') : null,
                    self.loadingCats ? (
                        LoadingIndicator ? m(LoadingIndicator) : m('div', null, 'Loading...')
                    ) : (
                        self.categories.length === 0
                            ? m('div', { className: 'LinkRobinsSupportAdmin-empty' },
                                'No categories yet. Create one to let users file tickets.')
                            : m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
                                m('thead', null, m('tr', null, [
                                    m('th', null, 'Name'),
                                    m('th', null, 'Slug'),
                                    m('th', null, 'Type'),
                                    m('th', null, 'Tickets'),
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
                                        }, 'Appeal') : 'General'),
                                        m('td', null, attr.ticketCount || 0),
                                        m('td', { className: 'LinkRobinsSupportAdmin-actions' }, [
                                            m('button', {
                                                type:      'button',
                                                className: 'Button Button--icon',
                                                title:     'Edit',
                                                onclick:   function () { self._openEditor(c); },
                                            }, m('i', { className: 'fas fa-pencil-alt' })),
                                            m('button', {
                                                type:      'button',
                                                className: 'Button Button--icon LinkRobinsSupportAdmin-danger',
                                                title:     'Delete',
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
                var name = attr.name || 'this category';
                var count = attr.ticketCount || 0;
                var warning = count > 0
                    ? 'This category has ' + count + ' tickets. The tickets will remain but will lose their category. Continue?'
                    : 'Delete "' + name + '"?';
                try {
                    if (!window.confirm(warning)) return;
                } catch (e) {}

                deleteCategoryRequest(cat.id)
                    .then(function () { self._loadCategories(); })
                    .catch(function (err) {
                        console.error('[linkrobins/support] delete category failed:', err);
                        showError('Could not delete the category.');
                    });
            }

            // --- Settings tab ---

            _renderSettingsTab() {
                var self = this;
                var fields = [
                    {
                        key:   'linkrobins-support.appeal_limit_per_window',
                        label: 'Max appeals per window',
                        help:  'Maximum number of appeal tickets a user can file in the appeal window.',
                        type:  'number', min: 1,
                        defaultValue: '3',
                    },
                    {
                        key:   'linkrobins-support.appeal_window_days',
                        label: 'Appeal window (days)',
                        help:  'The rolling time window for the "max appeals per window" limit.',
                        type:  'number', min: 1,
                        defaultValue: '30',
                    },
                    {
                        key:   'linkrobins-support.appeal_max_concurrent_open',
                        label: 'Concurrent open appeals per user',
                        help:  'How many appeals a user can have open at once before being blocked from filing more.',
                        type:  'number', min: 0,
                        defaultValue: '1',
                    },
                    {
                        key:   'linkrobins-support.general_limit_per_window',
                        label: 'Max general tickets per window',
                        help:  'Anti-flood limit for non-appeal tickets. Set high enough to not constrain real usage.',
                        type:  'number', min: 1,
                        defaultValue: '10',
                    },
                    {
                        key:   'linkrobins-support.general_window_hours',
                        label: 'General window (hours)',
                        help:  'The rolling time window for the "max general tickets per window" limit.',
                        type:  'number', min: 1,
                        defaultValue: '24',
                    },
                ];

                return m('div', { className: 'LinkRobinsSupportAdmin-section' }, [
                    m('div', { className: 'LinkRobinsSupportAdmin-sectionHeader' },
                        m('div', null, [
                            m('h3', null, 'Rate limits'),
                            m('p', { className: 'helpText' },
                                'Defaults are sensible for most communities. Set a limit to 0 to disable it entirely.'),
                        ])
                    ),
                    fields.map(function (f) {
                        return m('div', { className: 'Form-group', key: f.key }, [
                            m('label', null, f.label),
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
                            m('div', { className: 'helpText' }, f.help),
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
                            m('h3', null, 'Permanent appeal bans'),
                            m('p', { className: 'helpText' },
                                'Users on this list cannot file new appeal tickets. Their existing tickets remain visible and they can still file general tickets (unless suspended).'),
                        ])
                    ),

                    m('div', { className: 'Form-group LinkRobinsSupportAdmin-userSearch' }, [
                        m('label', null, 'Find a user to ban from appeals'),
                        m('div', { style: 'display:flex; gap:8px;' }, [
                            m('input', {
                                type:        'text',
                                className:   'FormControl',
                                placeholder: 'Username or email...',
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
                            }, 'Search'),
                        ]),
                        m('div', { className: 'helpText' },
                            'Matches against username or email. Results show users not currently banned.'),
                    ]),

                    this.appealError ? m('div', { className: 'Alert Alert--danger' },
                        'Search failed. Check the console.') : null,

                    this.appealLoading
                        ? (LoadingIndicator ? m(LoadingIndicator) : m('div', null, 'Loading...'))
                        : null,

                    !this.appealLoading && this.appealResults.length > 0
                        ? m('div', { className: 'LinkRobinsSupportAdmin-section', style: 'margin-top:18px;' }, [
                            m('h4', null, 'Search results'),
                            this._renderUsersTable(this.appealResults, false),
                        ])
                        : null,

                    m('div', { className: 'LinkRobinsSupportAdmin-section', style: 'margin-top:24px;' }, [
                        m('h4', null, 'Currently banned'),
                        this.bannedLoading
                            ? (LoadingIndicator ? m(LoadingIndicator) : m('div', null, 'Loading...'))
                            : (this.bannedUsers && this.bannedUsers.length > 0
                                ? this._renderUsersTable(this.bannedUsers, true)
                                : m('div', { className: 'LinkRobinsSupportAdmin-empty' },
                                    'Nobody is appeal-banned right now.')),
                    ]),
                ]);
            }

            _renderUsersTable(users, banned) {
                var self = this;
                return m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
                    m('thead', null, m('tr', null, [
                        m('th', null, 'Username'),
                        m('th', null, 'Email'),
                        m('th', { style: 'text-align:right;' }, 'Action'),
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
                                        ? 'Saving...'
                                        : (banned ? 'Unban from appeals' : 'Ban from appeals'))),
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
                        filter: { q: q },
                        page:   { limit: 25 },
                    },
                }).then(function (resp) {
                    var data = (resp && resp.data) || [];
                    // Filter out users we already show in "currently banned"
                    // so the result list is actionable.
                    self.appealResults = data.filter(function (u) {
                        var a = u.attributes || {};
                        return !a.supportAppealBanned;
                    });
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
                app.request({
                    method: 'GET',
                    url:    apiUrl() + '/users',
                    params: { page: { limit: 200 }, sort: '-joinedAt' },
                }).then(function (resp) {
                    var data = (resp && resp.data) || [];
                    self.bannedUsers = data.filter(function (u) {
                        return !!(u.attributes && u.attributes.supportAppealBanned);
                    });
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
                    showError('Could not change appeal-ban status. See console for details.');
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
                return this.editId ? 'Edit category' : 'New category';
            }

            content() {
                var self = this;
                return m('div', { className: 'Modal-body' }, [
                    self.error ? m('div', { className: 'Alert Alert--danger' },
                        self._errorMessage()) : null,

                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Name'),
                        m('input', {
                            type:      'text',
                            className: 'FormControl',
                            value:     self.name,
                            disabled:  self.saving,
                            oninput:   function (e) { self.name = e.target.value; },
                        }),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Slug'),
                        m('input', {
                            type:        'text',
                            className:   'FormControl',
                            value:       self.slug,
                            placeholder: 'auto-generated from name',
                            disabled:    self.saving,
                            oninput:     function (e) { self.slug = e.target.value; },
                        }),
                        m('div', { className: 'helpText' },
                            'URL-friendly identifier. Leave blank to auto-generate from the name.'),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Description'),
                        m('textarea', {
                            className: 'FormControl',
                            rows:      3,
                            value:     self.description,
                            disabled:  self.saving,
                            oninput:   function (e) { self.description = e.target.value; },
                        }),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Color'),
                        m('input', {
                            type:      'text',
                            className: 'FormControl',
                            value:     self.color,
                            disabled:  self.saving,
                            placeholder: '#07adcc',
                            oninput:   function (e) { self.color = e.target.value; },
                        }),
                        m('div', { className: 'helpText' }, 'Hex color (e.g. #07adcc) for the category tag.'),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Icon'),
                        m('input', {
                            type:      'text',
                            className: 'FormControl',
                            value:     self.icon,
                            disabled:  self.saving,
                            placeholder: 'fas fa-folder',
                            oninput:   function (e) { self.icon = e.target.value; },
                        }),
                        m('div', { className: 'helpText' }, 'Font Awesome class (lowercase letters/digits/spaces/dashes).'),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Position'),
                        m('input', {
                            type:      'number',
                            className: 'FormControl',
                            value:     self.position,
                            disabled:  self.saving,
                            oninput:   function (e) { self.position = parseInt(e.target.value, 10) || 0; },
                        }),
                        m('div', { className: 'helpText' }, 'Lower numbers appear first.'),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('label', { className: 'LinkRobinsSupportAdmin-checkbox' }, [
                            m('input', {
                                type:    'checkbox',
                                checked: self.isAppeal,
                                disabled: self.saving,
                                onchange: function (e) { self.isAppeal = !!e.target.checked; },
                            }),
                            ' Appeal category',
                        ]),
                        m('div', { className: 'helpText' },
                            'Banned users can file tickets in this category. Appeal-specific rate limits apply.'),
                    ]),

                    m('div', { className: 'Form-group' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  self.saving || !self.name.trim(),
                            onclick:   function () { self._save(); },
                        }, self.saving ? 'Saving…' : (self.editId ? 'Update category' : 'Create category')),
                    ]),
                ]);
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return 'Unknown error.';
                try {
                    var errors = err.response && err.response.errors;
                    if (errors && errors[0]) {
                        return errors[0].detail || errors[0].title || 'Could not save.';
                    }
                } catch (e) {}
                return 'Could not save the category.';
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
