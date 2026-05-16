'use strict';

(function () {

    var BASE_PATH = '/support';

    // --- Helpers ---------------------------------------------------------

    function readForumAttribute(key) {
        try {
            if (app.forum && typeof app.forum.attribute === 'function') {
                return app.forum.attribute(key);
            }
        } catch (e) {}
        return null;
    }

    function basePath() {
        try {
            return (app.forum && app.forum.attribute && app.forum.attribute('basePath')) || '';
        } catch (e) { return ''; }
    }

    function canCreateSupportTicket() {
        try {
            if (!app.session || !app.session.user) return false;
            if (typeof app.session.user.isAdmin === 'function' && app.session.user.isAdmin()) return true;
            return !!readForumAttribute('canCreateSupportTicket');
        } catch (e) { return false; }
    }

    function canHandleSupportTickets() {
        try {
            if (!app.session || !app.session.user) return false;
            if (typeof app.session.user.isAdmin === 'function' && app.session.user.isAdmin()) return true;
            return !!readForumAttribute('canHandleSupportTickets');
        } catch (e) { return false; }
    }

    function supportAppealBanned() {
        try {
            return !!readForumAttribute('supportAppealBanned');
        } catch (e) { return false; }
    }

    function isUserSuspended() {
        // True when the actor's account is currently suspended via the
        // flarum/suspend extension. The backend reports this via the
        // `supportSuspended` attribute on the forum payload (NOT by
        // group membership -- Flarum has no built-in "Banned" group).
        try {
            return !!readForumAttribute('supportSuspended');
        } catch (e) { return false; }
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch (e) { return ''; }
    }

    function safeNavigate(href, ev) {
        if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) return;
        if (typeof href !== 'string' || href === '') return;
        var base = basePath();
        var path = href;
        if (base && href.indexOf(base) === 0) path = href.slice(base.length);
        if (path.charAt(0) !== '/') return;
        if (ev) ev.preventDefault();
        try { m.route.set(path); } catch (e) {}
    }

    function findIncluded(included, type, id) {
        if (!included || !id) return null;
        for (var i = 0; i < included.length; i++) {
            if (included[i].type === type && String(included[i].id) === String(id)) return included[i];
        }
        return null;
    }

    function relatedUser(rec, included) {
        var rel = rec && rec.relationships && rec.relationships.user && rec.relationships.user.data;
        if (!rel) return null;
        return findIncluded(included, 'users', rel.id);
    }

    function relatedCategory(ticket, included) {
        var rel = ticket && ticket.relationships && ticket.relationships.category && ticket.relationships.category.data;
        if (!rel) return null;
        return findIncluded(included, 'linkrobins-support-categories', rel.id);
    }

    function relatedAssignedStaff(ticket, included) {
        var rel = ticket && ticket.relationships && ticket.relationships.assignedStaff && ticket.relationships.assignedStaff.data;
        if (!rel) return null;
        return findIncluded(included, 'users', rel.id);
    }

    // --- API helpers ----------------------------------------------------

    function apiUrl() {
        return app.forum.attribute('apiUrl');
    }

    function fetchTickets(params) {
        return app.request({
            method: 'GET',
            url:    apiUrl() + '/linkrobins-support-tickets',
            params: Object.assign({
                sort:    '-lastReplyAt',
                page:    { limit: 25 },
                include: 'user,category,assignedStaff',
            }, params || {}),
        });
    }

    function fetchTicket(id) {
        return app.request({
            method: 'GET',
            url:    apiUrl() + '/linkrobins-support-tickets/' + encodeURIComponent(id),
            params: { include: 'user,category,assignedStaff' },
        });
    }

    function fetchReplies(ticketId) {
        return app.request({
            method: 'GET',
            url:    apiUrl() + '/linkrobins-support-replies',
            params: {
                sort:    'createdAt',
                filter:  { ticketId: ticketId },
                page:    { limit: 200 },
                include: 'user',
            },
        });
    }

    function fetchCategories() {
        return app.request({
            method: 'GET',
            url:    apiUrl() + '/linkrobins-support-categories',
            params: { sort: 'position', page: { limit: 100 } },
        });
    }

    function createTicket(subject, categoryId, body) {
        return app.request({
            method: 'POST',
            url:    apiUrl() + '/linkrobins-support-tickets',
            body:   {
                data: {
                    type: 'linkrobins-support-tickets',
                    attributes: { subject: subject },
                    relationships: {
                        category: { data: { type: 'linkrobins-support-categories', id: String(categoryId) } },
                    },
                },
            },
        }).then(function (resp) {
            // Post the initial body as the first reply.
            var ticket = resp.data;
            if (!ticket) return resp;
            return postReply(ticket.id, body, false).then(function () { return resp; });
        });
    }

    function postReply(ticketId, content, isInternal) {
        return app.request({
            method: 'POST',
            url:    apiUrl() + '/linkrobins-support-replies',
            body:   {
                data: {
                    type: 'linkrobins-support-replies',
                    attributes: {
                        content:        content,
                        isInternalNote: !!isInternal,
                    },
                    relationships: {
                        ticket: { data: { type: 'linkrobins-support-tickets', id: String(ticketId) } },
                    },
                },
            },
        });
    }

    /**
     * Upload a FileList through fof/upload's API and append the returned
     * BBCode markup to `target[bodyKey]`. Updates `uploadingCount` and
     * `uploadError` on the target so views can render progress / errors.
     *
     * Pulled out of the compose/reply forms so both use one code path.
     * If fof/upload isn't installed the upload affordance isn't rendered,
     * so we never reach here in that case.
     */
    function uploadFilesToBody(target, files, bodyKey) {
        target.uploadError    = null;
        target.uploadingCount = (target.uploadingCount || 0) + files.length;
        m.redraw();

        var form = new FormData();
        for (var i = 0; i < files.length; i++) {
            form.append('files[]', files[i]);
        }

        return app.request({
            method:    'POST',
            url:       apiUrl() + '/fof/upload',
            body:      form,
            serialize: function (raw) { return raw; },
        }).then(function (resp) {
            target.uploadingCount = Math.max(0, target.uploadingCount - files.length);
            var data = (resp && resp.data) || [];
            var inserted = '';
            data.forEach(function (file) {
                var attrs = (file && file.attributes) || {};
                // fof/upload returns `bbcode` for posts. If it's missing
                // (older versions), build a minimal upl-file marker from
                // the uuid + size as a safe fallback.
                var bb = attrs.bbcode;
                if (!bb && attrs.uuid) {
                    var name = attrs.base_name || attrs.uuid;
                    var size = attrs.size != null ? String(attrs.size) : '0';
                    bb = '[upl-file uuid="' + attrs.uuid + '" size="' + size + '"]' + name + '[/upl-file]';
                }
                if (bb) inserted += (inserted ? '\n' : '') + bb;
            });
            if (inserted) {
                var existing = target[bodyKey] || '';
                var sep = existing && !existing.endsWith('\n') ? '\n' : '';
                target[bodyKey] = existing + sep + inserted + '\n';
            } else {
                target.uploadError = 'Upload returned no files. Please try again.';
            }
            m.redraw();
        }).catch(function (err) {
            target.uploadingCount = Math.max(0, target.uploadingCount - files.length);
            var msg = 'Could not upload file.';
            try {
                var resp = err && err.response;
                if (resp && resp.errors && resp.errors[0]) {
                    msg = resp.errors[0].detail || resp.errors[0].title || msg;
                }
            } catch (e) {}
            target.uploadError = msg;
            console.error('[linkrobins/support] upload failed:', err);
            m.redraw();
        });
    }

    function updateTicket(id, attrs, relationships) {
        var data = {
            type: 'linkrobins-support-tickets',
            id:   String(id),
            attributes: attrs || {},
        };
        if (relationships) data.relationships = relationships;
        return app.request({
            method: 'PATCH',
            url:    apiUrl() + '/linkrobins-support-tickets/' + encodeURIComponent(id),
            body:   { data: data },
        });
    }

    // --- Status display helpers -----------------------------------------

    var STATUS_LABELS = {
        open:           'Open',
        in_progress:    'In progress',
        awaiting_user:  'Awaiting your reply',
        resolved:       'Resolved',
        closed:         'Closed',
    };

    var STATUS_CLASSES = {
        open:          'is-open',
        in_progress:   'is-progress',
        awaiting_user: 'is-awaiting',
        resolved:      'is-resolved',
        closed:        'is-closed',
    };

    function statusBadge(status) {
        var label = STATUS_LABELS[status] || status;
        var cls   = STATUS_CLASSES[status] || '';
        return m('span', {
            className: 'LinkRobinsSupport-status ' + cls,
        }, label);
    }

    // --- Pages ----------------------------------------------------------

    function init() {
        var Page         = null;
        var LinkButton   = null;
        var Button       = null;
        var LoadingIndicator = null;
        var PageStructure = null;
        try { Page             = flarum.reg.get('core', 'common/components/Page'); }             catch (e) {}
        try { LinkButton       = flarum.reg.get('core', 'common/components/LinkButton'); }       catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }           catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}
        try { PageStructure    = flarum.reg.get('core', 'forum/components/PageStructure'); }     catch (e) {}

        if (!Page) {
            console.error('[linkrobins/support] Page component not available; aborting.');
            return;
        }

        var IndexPage   = makeIndexPage(Page, LoadingIndicator);
        var ComposePage = makeComposePage(Page, LoadingIndicator);
        var ShowPage    = makeShowPage(Page, LoadingIndicator);

        app.routes['linkrobins-support.index']   = { path: BASE_PATH,            component: IndexPage };
        app.routes['linkrobins-support.compose'] = { path: BASE_PATH + '/new',   component: ComposePage };
        app.routes['linkrobins-support.show']    = { path: BASE_PATH + '/:id',   component: ShowPage };

        // Register a thin SupportTicket model so Flarum's store can
        // hydrate `notification.subject()` when it surfaces a
        // linkrobins-support-tickets resource. Without this, the
        // notification dropdown would render "Unknown notification type"
        // and the subject().attribute() lookups in our notification
        // components would fail.
        try {
            var Model = flarum.reg.get('core', 'common/Model');
            if (Model && app.store && app.store.models && !app.store.models['linkrobins-support-tickets']) {
                var SupportTicketModel = function () { Model.apply(this, arguments); };
                SupportTicketModel.prototype = Object.create(Model.prototype);
                SupportTicketModel.prototype.constructor = SupportTicketModel;
                // Minimal attribute helpers; the raw payload is still
                // accessible via attribute('subject') / attribute('status')
                // on every Flarum Model so we don't need to wire each one
                // unless a notification component needs it. The model
                // existing is what unblocks store hydration.
                app.store.models['linkrobins-support-tickets'] = SupportTicketModel;
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not register ticket model on store:', e);
        }

        // Register notification components so the bell-icon dropdown can
        // render our notification types instead of falling back to the
        // generic "Unknown notification type" message.
        try {
            var Notification = flarum.reg.get('core', 'forum/components/Notification');
            if (Notification && app.notificationComponents) {
                app.notificationComponents['linkrobinsSupportNewReply'] =
                    makeNewReplyNotification(Notification);
                app.notificationComponents['linkrobinsSupportNewTicket'] =
                    makeNewTicketNotification(Notification);
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not register notification components:', e);
        }

        // Add the notification types to the user's preferences grid so
        // they can opt in/out per driver (alert / email).
        try {
            var extMod0 = flarum.reg.get('core', 'common/extend');
            var extend0 = extMod0 && extMod0.extend;
            var NotificationGrid = flarum.reg.get('core', 'forum/components/NotificationGrid');
            if (NotificationGrid && typeof extend0 === 'function') {
                extend0(NotificationGrid.prototype, 'notificationTypes', function (items) {
                    items.add('linkrobinsSupportNewReply', {
                        name: 'linkrobinsSupportNewReply',
                        icon: 'fas fa-life-ring',
                        label: 'Someone replies to your support ticket',
                    });
                    items.add('linkrobinsSupportNewTicket', {
                        name: 'linkrobinsSupportNewTicket',
                        icon: 'fas fa-ticket-alt',
                        label: 'A new support ticket is opened',
                    });
                });
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not extend NotificationGrid:', e);
        }

        // Add a "Support" link to Flarum's main sidebar so the page is
        // discoverable for everyone, not just people who already know the
        // URL.
        try {
            var IndexSidebar = flarum.reg.get('core', 'forum/components/IndexSidebar');
            var extMod       = flarum.reg.get('core', 'common/extend');
            var extend       = extMod && extMod.extend;
            if (IndexSidebar && LinkButton && typeof extend === 'function') {
                extend(IndexSidebar.prototype, 'navItems', function (items) {
                    if (!app.session || !app.session.user) return;
                    var bp = basePath();
                    items.add('linkrobins-support', m(LinkButton, {
                        href: bp + BASE_PATH,
                        icon: 'fas fa-life-ring',
                    }, 'Support'), 30);
                });
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not extend IndexSidebar:', e);
        }
    }

    // Factory: NewSupportReplyNotification component
    function makeNewReplyNotification(NotificationBase) {
        return class NewSupportReplyNotification extends NotificationBase {
            icon() {
                return 'fas fa-life-ring';
            }
            href() {
                // The notification subject is the ticket. If for any
                // reason it isn't hydrated, fall back to the support
                // index so the user lands somewhere useful.
                var subj = this.attrs && this.attrs.notification
                    ? this.attrs.notification.subject()
                    : null;
                var bp = basePath();
                if (subj && subj.id) {
                    return bp + BASE_PATH + '/' + subj.id();
                }
                return bp + BASE_PATH;
            }
            content() {
                var n = this.attrs && this.attrs.notification;
                var from = n && n.fromUser && n.fromUser();
                if (from && from.displayName) {
                    return from.displayName() + ' replied to your ticket';
                }
                return 'Support replied to your ticket';
            }
            excerpt() {
                var subj = this.attrs && this.attrs.notification
                    ? this.attrs.notification.subject()
                    : null;
                if (subj && subj.attribute) {
                    var s = subj.attribute('subject');
                    if (s) return s;
                }
                return '';
            }
        };
    }

    // Factory: NewSupportTicketNotification component (for staff)
    function makeNewTicketNotification(NotificationBase) {
        return class NewSupportTicketNotification extends NotificationBase {
            icon() {
                return 'fas fa-ticket-alt';
            }
            href() {
                var subj = this.attrs && this.attrs.notification
                    ? this.attrs.notification.subject()
                    : null;
                var bp = basePath();
                if (subj && subj.id) {
                    return bp + BASE_PATH + '/' + subj.id();
                }
                return bp + BASE_PATH;
            }
            content() {
                var n = this.attrs && this.attrs.notification;
                var data = n && n.content && n.content();
                var isAppeal = !!(data && data.isAppeal);
                var from = n && n.fromUser && n.fromUser();
                var who = (from && from.displayName) ? from.displayName() : 'A user';
                return who + ' opened a new ' + (isAppeal ? 'appeal' : 'support ticket');
            }
            excerpt() {
                var subj = this.attrs && this.attrs.notification
                    ? this.attrs.notification.subject()
                    : null;
                if (subj && subj.attribute) {
                    var s = subj.attribute('subject');
                    if (s) return s;
                }
                return '';
            }
        };
    }

    // --- Index page -----------------------------------------------------

    function makeIndexPage(Page, LoadingIndicator) {
        return class SupportIndexPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading  = true;
                this.error    = null;
                this.tickets  = [];
                this.included = [];
                this.filter   = (this.attrs && this.attrs.status) || 'mine';
                try { app.setTitle('Support'); } catch (e) {}
                this._load();
            }

            _load() {
                var self = this;
                self.loading = true;
                m.redraw();

                // Filters must be sent as filter[name] (Flarum 2 rejects
                // unknown top-level query parameters), so we nest them.
                var filter = {};
                if (canHandleSupportTickets() && self.filter !== 'mine') {
                    if (self.filter && self.filter !== 'all') {
                        filter.status = self.filter;
                    }
                } else {
                    filter.mine = '1';
                }
                var params = { page: { limit: 25 } };
                if (Object.keys(filter).length) {
                    params.filter = filter;
                }

                fetchTickets(params)
                    .then(function (resp) {
                        self.tickets  = (resp && resp.data) || [];
                        self.included = (resp && resp.included) || [];
                        self.loading  = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.error   = err;
                        self.loading = false;
                        console.error('[linkrobins/support] index load failed:', err);
                        m.redraw();
                    });
            }

            view(vnode) {
                if (super.view) {
                    // Keep the super-template wrapper but render our own
                    // content. Page provides things like document scroll
                    // restoration and the standard app chrome.
                }
                return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                    m('div', { className: 'container LinkRobinsSupport-container' }, [
                        this._renderHeader(),
                        this._renderFilters(),
                        this._renderList(),
                    ])
                );
            }

            _renderHeader() {
                var self = this;
                return m('header', { className: 'LinkRobinsSupport-header' }, [
                    m('h1', { className: 'LinkRobinsSupport-title' }, [
                        m('i', { className: 'fas fa-life-ring' }), ' Support',
                    ]),
                    canCreateSupportTicket() ? m('a', {
                        href: basePath() + BASE_PATH + '/new',
                        className: 'Button Button--primary LinkRobinsSupport-new',
                        onclick: function (e) { safeNavigate(basePath() + BASE_PATH + '/new', e); },
                    }, [m('i', { className: 'fas fa-plus' }), ' New ticket']) : null,
                ]);
            }

            _renderFilters() {
                var self = this;
                if (!canHandleSupportTickets()) return null;

                var options = [
                    { id: 'mine',           label: 'My tickets' },
                    { id: 'all',            label: 'All' },
                    { id: 'open',           label: 'Open' },
                    { id: 'in_progress',    label: 'In progress' },
                    { id: 'awaiting_user',  label: 'Awaiting user' },
                    { id: 'resolved',       label: 'Resolved' },
                    { id: 'closed',         label: 'Closed' },
                ];

                return m('div', { className: 'LinkRobinsSupport-filters' },
                    options.map(function (opt) {
                        return m('button', {
                            type:      'button',
                            className: 'LinkRobinsSupport-filter'
                                + (self.filter === opt.id ? ' is-active' : ''),
                            onclick:   function () {
                                self.filter = opt.id;
                                self._load();
                            },
                        }, opt.label);
                    })
                );
            }

            _renderList() {
                var self = this;
                if (self.loading) {
                    return LoadingIndicator
                        ? m(LoadingIndicator)
                        : m('div', null, 'Loading...');
                }
                if (self.error) {
                    return m('div', { className: 'LinkRobinsSupport-empty' },
                        'Could not load tickets.');
                }
                if (!self.tickets.length) {
                    return m('div', { className: 'LinkRobinsSupport-empty' },
                        canCreateSupportTicket()
                            ? 'No tickets yet. Click "New ticket" to open one.'
                            : 'No tickets to show.');
                }
                return m('div', { className: 'LinkRobinsSupport-list' },
                    self.tickets.map(function (t) { return self._renderRow(t); })
                );
            }

            _renderRow(ticket) {
                var self  = this;
                var attr  = ticket.attributes || {};
                var user  = relatedUser(ticket, self.included);
                var cat   = relatedCategory(ticket, self.included);
                var href  = basePath() + BASE_PATH + '/' + encodeURIComponent(ticket.id);

                return m('a', {
                    href:      href,
                    className: 'LinkRobinsSupport-row',
                    onclick:   function (e) { safeNavigate(href, e); },
                    key:       'ticket-' + ticket.id,
                }, [
                    m('div', { className: 'LinkRobinsSupport-row-main' }, [
                        m('div', { className: 'LinkRobinsSupport-row-subject' }, attr.subject || 'Untitled'),
                        m('div', { className: 'LinkRobinsSupport-row-meta' }, [
                            cat ? m('span', {
                                className: 'LinkRobinsSupport-row-cat',
                                style:     'color: ' + (cat.attributes.color || 'inherit'),
                            }, cat.attributes.name) : null,
                            user ? m('span', { className: 'LinkRobinsSupport-row-user' },
                                user.attributes.displayName || user.attributes.username) : null,
                            m('span', { className: 'LinkRobinsSupport-row-date' },
                                formatDate(attr.lastReplyAt || attr.createdAt)),
                        ]),
                    ]),
                    m('div', { className: 'LinkRobinsSupport-row-status' },
                        statusBadge(attr.status)),
                ]);
            }
        };
    }

    // --- Compose page ---------------------------------------------------

    function makeComposePage(Page, LoadingIndicator) {
        return class SupportComposePage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading    = true;
                this.saving     = false;
                this.error      = null;
                this.categories = [];
                this.subject    = '';
                this.body       = '';
                this.categoryId = '';
                this.uploadingCount = 0;
                this.uploadError    = null;
                try { app.setTitle('New ticket'); } catch (e) {}

                if (!app.session || !app.session.user) {
                    m.route.set('/');
                    return;
                }

                this._loadCategories();
            }

            _loadCategories() {
                var self = this;
                fetchCategories()
                    .then(function (resp) {
                        var cats = (resp && resp.data) || [];
                        // Banned users only see appeal categories.
                        if (isUserSuspended()) {
                            cats = cats.filter(function (c) {
                                return c.attributes && c.attributes.isAppeal === true;
                            });
                        }
                        self.categories = cats;
                        if (cats.length > 0 && !self.categoryId) {
                            self.categoryId = String(cats[0].id);
                        }
                        self.loading = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.error   = err;
                        self.loading = false;
                        console.error('[linkrobins/support] categories load failed:', err);
                        m.redraw();
                    });
            }

            view(vnode) {
                var self = this;

                if (supportAppealBanned() && isUserSuspended()) {
                    return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                        m('div', { className: 'container LinkRobinsSupport-container' }, [
                            m('header', { className: 'LinkRobinsSupport-header' },
                                m('h1', { className: 'LinkRobinsSupport-title' }, 'Support')
                            ),
                            m('div', { className: 'LinkRobinsSupport-empty LinkRobinsSupport-empty--blocked' },
                                'You are not permitted to file appeals. Please contact the site owner via another channel.'
                            ),
                        ])
                    );
                }

                if (self.loading) {
                    return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                        m('div', { className: 'container' },
                            LoadingIndicator ? m(LoadingIndicator) : 'Loading...'
                        )
                    );
                }

                if (self.categories.length === 0) {
                    return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                        m('div', { className: 'container LinkRobinsSupport-container' }, [
                            m('header', { className: 'LinkRobinsSupport-header' },
                                m('h1', { className: 'LinkRobinsSupport-title' }, 'Support')
                            ),
                            m('div', { className: 'LinkRobinsSupport-empty' },
                                isUserSuspended()
                                    ? 'No appeal categories are currently available.'
                                    : 'No support categories have been set up yet. Please contact an admin.'
                            ),
                        ])
                    );
                }

                var canSave = !self.saving
                    && self.subject.trim() !== ''
                    && self.body.trim() !== ''
                    && self.categoryId !== '';

                return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                    m('div', { className: 'container LinkRobinsSupport-container' }, [
                        m('header', { className: 'LinkRobinsSupport-header' }, [
                            m('h1', { className: 'LinkRobinsSupport-title' },
                                isUserSuspended() ? 'File an appeal' : 'New support ticket'),
                            m('a', {
                                href:    basePath() + BASE_PATH,
                                className: 'Button Button--text',
                                onclick: function (e) { safeNavigate(basePath() + BASE_PATH, e); },
                            }, [m('i', { className: 'fas fa-arrow-left' }), ' Back']),
                        ]),

                        self.error ? m('div', { className: 'Alert Alert--danger' }, [
                            m('span', { className: 'Alert-body' }, self._errorMessage()),
                        ]) : null,

                        m('div', { className: 'LinkRobinsSupport-form' }, [
                            m('div', { className: 'Form-group' }, [
                                m('label', null, 'Category'),
                                m('select', {
                                    className: 'FormControl',
                                    value:     self.categoryId,
                                    disabled:  self.saving || self.categories.length < 2,
                                    onchange:  function (e) { self.categoryId = e.target.value; },
                                }, self.categories.map(function (c) {
                                    return m('option', { value: String(c.id) }, c.attributes.name);
                                })),
                            ]),
                            m('div', { className: 'Form-group' }, [
                                m('label', null, 'Subject'),
                                m('input', {
                                    type:        'text',
                                    className:   'FormControl',
                                    value:       self.subject,
                                    disabled:    self.saving,
                                    placeholder: 'Short summary of your issue',
                                    maxlength:   200,
                                    oninput:     function (e) { self.subject = e.target.value; },
                                }),
                            ]),
                            m('div', { className: 'Form-group' }, [
                                m('label', null, 'Message'),
                                m('textarea', {
                                    className:   'FormControl LinkRobinsSupport-body',
                                    rows:        10,
                                    value:       self.body,
                                    disabled:    self.saving,
                                    placeholder: 'Describe the issue in detail. Markdown is supported.',
                                    oninput:     function (e) { self.body = e.target.value; },
                                }),
                                self.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' },
                                    self.uploadError) : null,
                                self.uploadingCount > 0 ? m('div', { className: 'LinkRobinsSupport-uploadStatus' },
                                    'Uploading ' + self.uploadingCount + ' file' +
                                    (self.uploadingCount === 1 ? '' : 's') + '…') : null,
                            ]),
                            m('div', { className: 'LinkRobinsSupport-form-actions' }, [
                                (app.forum && app.forum.attribute('fof-upload.canUpload')) ? m('label', {
                                    className: 'Button Button--default LinkRobinsSupport-attachBtn',
                                }, [
                                    m('i', { className: 'fas fa-paperclip' }),
                                    ' Attach files',
                                    m('input', {
                                        type:     'file',
                                        multiple: true,
                                        style:    'display:none;',
                                        disabled: self.saving || self.uploadingCount > 0,
                                        onchange: function (e) {
                                            var files = e.target.files;
                                            if (files && files.length) {
                                                self._uploadFiles(files);
                                            }
                                            try { e.target.value = ''; } catch (err) {}
                                        },
                                    }),
                                ]) : null,
                                m('button', {
                                    type:      'button',
                                    className: 'Button Button--primary',
                                    disabled:  !canSave,
                                    onclick:   function () { self._submit(); },
                                }, self.saving ? 'Submitting…' : 'Submit ticket'),
                            ]),
                        ]),
                    ])
                );
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return 'Unknown error.';
                try {
                    var errors = err.response && err.response.errors;
                    if (errors && errors[0]) {
                        return errors[0].detail || errors[0].title || 'Could not submit.';
                    }
                } catch (e) {}
                return 'Could not submit the ticket.';
            }

            _submit() {
                var self = this;
                self.saving = true;
                self.error  = null;
                m.redraw();

                createTicket(self.subject.trim(), self.categoryId, self.body)
                    .then(function (resp) {
                        self.saving = false;
                        var ticket = resp && resp.data;
                        if (ticket && ticket.id) {
                            m.route.set(BASE_PATH + '/' + encodeURIComponent(ticket.id));
                        } else {
                            m.route.set(BASE_PATH);
                        }
                    })
                    .catch(function (err) {
                        self.saving = false;
                        self.error  = err;
                        console.error('[linkrobins/support] submit failed:', err);
                        m.redraw();
                    });
            }

            _uploadFiles(files) {
                return uploadFilesToBody(this, files, 'body');
            }
        };
    }

    // --- Show page ------------------------------------------------------

    function makeShowPage(Page, LoadingIndicator) {
        return class SupportShowPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading    = true;
                this.error      = null;
                this.ticket     = null;
                this.included   = [];
                this.replies    = [];
                this.repliesIncluded = [];
                this.replyText  = '';
                this.replyIsInternal = false;
                this.posting    = false;
                this.updating   = false;
                this.uploadingCount = 0;
                this.uploadError    = null;
                try { app.setTitle('Ticket'); } catch (e) {}
                this._ticketId = (this.attrs && this.attrs.id) || null;
                if (this._ticketId) this._load();
            }

            onupdate(vnode) {
                if (super.onupdate) super.onupdate(vnode);
                var newId = (this.attrs && this.attrs.id) || null;
                if (newId !== this._ticketId) {
                    this._ticketId = newId;
                    this.loading = true;
                    this.ticket  = null;
                    this.replies = [];
                    if (newId) this._load();
                }
            }

            _load() {
                var self = this;
                self.loading = true;
                m.redraw();

                Promise.all([
                    fetchTicket(self._ticketId),
                    fetchReplies(self._ticketId),
                ]).then(function (results) {
                    self.ticket          = results[0].data;
                    self.included        = results[0].included || [];
                    self.replies         = results[1].data || [];
                    self.repliesIncluded = results[1].included || [];
                    self.loading         = false;
                    try {
                        var t = self.ticket && self.ticket.attributes && self.ticket.attributes.subject;
                        if (t) app.setTitle(t);
                    } catch (e) {}
                    m.redraw();
                }).catch(function (err) {
                    self.error   = err;
                    self.loading = false;
                    console.error('[linkrobins/support] ticket load failed:', err);
                    m.redraw();
                });
            }

            view(vnode) {
                var self = this;
                if (self.loading) {
                    return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                        m('div', { className: 'container' },
                            LoadingIndicator ? m(LoadingIndicator) : 'Loading...'
                        )
                    );
                }
                if (self.error || !self.ticket) {
                    return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                        m('div', { className: 'container LinkRobinsSupport-container' }, [
                            m('header', { className: 'LinkRobinsSupport-header' }, [
                                m('h1', { className: 'LinkRobinsSupport-title' }, 'Ticket'),
                                m('a', {
                                    href:    basePath() + BASE_PATH,
                                    className: 'Button Button--text',
                                    onclick: function (e) { safeNavigate(basePath() + BASE_PATH, e); },
                                }, [m('i', { className: 'fas fa-arrow-left' }), ' Back']),
                            ]),
                            m('div', { className: 'LinkRobinsSupport-empty' },
                                'Could not load this ticket. It may have been deleted, or you may not have permission to view it.'
                            ),
                        ])
                    );
                }

                var attr     = self.ticket.attributes || {};
                var creator  = relatedUser(self.ticket, self.included);
                var category = relatedCategory(self.ticket, self.included);

                return m('div', { className: 'IndexPage LinkRobinsSupport-page' },
                    m('div', { className: 'container LinkRobinsSupport-container' }, [
                        m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-ticket-header' }, [
                            m('div', { className: 'LinkRobinsSupport-ticket-titleRow' }, [
                                m('a', {
                                    href: basePath() + BASE_PATH,
                                    className: 'Button Button--text LinkRobinsSupport-back',
                                    onclick: function (e) { safeNavigate(basePath() + BASE_PATH, e); },
                                }, [m('i', { className: 'fas fa-arrow-left' })]),
                                m('h1', { className: 'LinkRobinsSupport-title' }, attr.subject),
                                statusBadge(attr.status),
                            ]),
                            m('div', { className: 'LinkRobinsSupport-ticket-meta' }, [
                                category ? m('span', {
                                    className: 'LinkRobinsSupport-row-cat',
                                    style:     'color: ' + (category.attributes.color || 'inherit'),
                                }, category.attributes.name) : null,
                                creator ? m('span', null,
                                    'Opened by ' + (creator.attributes.displayName || creator.attributes.username)
                                ) : null,
                                m('span', null, formatDate(attr.createdAt)),
                            ]),
                            attr.decision ? m('div', { className: 'LinkRobinsSupport-decision' }, [
                                'Decision: ',
                                m('span', { className: 'LinkRobinsSupport-decision-' + attr.decision },
                                    attr.decision),
                            ]) : null,
                        ]),

                        canHandleSupportTickets() ? this._renderStaffControls(attr) : null,

                        m('div', { className: 'LinkRobinsSupport-replies' },
                            self.replies.map(function (r) { return self._renderReply(r); })
                        ),

                        attr.canReply ? this._renderReplyForm() : (
                            m('div', { className: 'LinkRobinsSupport-empty' },
                                attr.status === 'closed'
                                    ? 'This ticket has been closed and cannot be replied to.'
                                    : 'You cannot reply to this ticket.')
                        ),
                    ])
                );
            }

            _renderStaffControls(attr) {
                var self  = this;
                var staff = canHandleSupportTickets();
                if (!staff) return null;
                if (attr.status === 'closed') {
                    return m('div', { className: 'LinkRobinsSupport-staffBar' }, [
                        m('span', { className: 'LinkRobinsSupport-staffBar-label' }, 'Closed ticket'),
                        this._renderAssignmentRow(false),
                    ]);
                }
                var statuses = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];

                return m('div', { className: 'LinkRobinsSupport-staffBar' }, [
                    m('span', { className: 'LinkRobinsSupport-staffBar-label' }, 'Set status:'),
                    m('div', { className: 'LinkRobinsSupport-staffBar-buttons' },
                        statuses.map(function (s) {
                            return m('button', {
                                type:      'button',
                                className: 'Button Button--default LinkRobinsSupport-staffBtn'
                                    + (attr.status === s ? ' is-active' : ''),
                                disabled:  self.updating || attr.status === s,
                                onclick:   function () { self._setStatus(s); },
                            }, STATUS_LABELS[s]);
                        })
                    ),
                    this._renderAssignmentRow(true),
                ]);
            }

            _renderAssignmentRow(allowChanges) {
                var self = this;
                var assigned = relatedAssignedStaff(this.ticket, this.included);
                var actor = app.session && app.session.user;
                var actorIsAssigned = assigned && actor && String(assigned.id) === String(actor.id());
                var label = assigned
                    ? 'Assigned to ' + (assigned.attributes && assigned.attributes.username || ('user #' + assigned.id))
                    : 'Unassigned';

                return m('div', { className: 'LinkRobinsSupport-staffBar-assign' }, [
                    m('span', { className: 'LinkRobinsSupport-staffBar-label' }, label),
                    allowChanges && !actorIsAssigned
                        ? m('button', {
                            type:      'button',
                            className: 'Button Button--default LinkRobinsSupport-staffBtn',
                            disabled:  self.updating,
                            onclick:   function () { self._claim(); },
                        }, 'Claim')
                        : null,
                    allowChanges && assigned
                        ? m('button', {
                            type:      'button',
                            className: 'Button Button--default LinkRobinsSupport-staffBtn',
                            disabled:  self.updating,
                            onclick:   function () { self._unassign(); },
                        }, 'Unassign')
                        : null,
                ]);
            }

            _claim() {
                var actor = app.session && app.session.user;
                if (!actor) return;
                this._setAssignment(actor.id());
            }

            _unassign() {
                this._setAssignment(null);
            }

            _setAssignment(userId) {
                var self = this;
                self.updating = true;
                m.redraw();
                var relationships = {
                    assignedStaff: {
                        data: userId === null ? null : { type: 'users', id: String(userId) },
                    },
                };
                updateTicket(self.ticket.id, {}, relationships)
                    .then(function (resp) {
                        self.ticket = resp.data;
                        if (resp.included) {
                            // Merge included so the new user appears in the
                            // assignment label without a refetch.
                            self.included = (self.included || []).concat(resp.included);
                        }
                        self.updating = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.updating = false;
                        console.error('[linkrobins/support] assignment update failed:', err);
                        try { alert('Could not update assignment.'); } catch (e) {}
                        m.redraw();
                    });
            }

            _setStatus(status) {
                var self = this;
                self.updating = true;
                m.redraw();
                updateTicket(self.ticket.id, { status: status })
                    .then(function (resp) {
                        self.ticket = resp.data;
                        self.updating = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.updating = false;
                        console.error('[linkrobins/support] status update failed:', err);
                        try { alert('Could not update status.'); } catch (e) {}
                        m.redraw();
                    });
            }

            _renderReply(reply) {
                var self  = this;
                var attr  = reply.attributes || {};
                var user  = relatedUser(reply, self.repliesIncluded);
                var html  = attr.contentHtml || '';
                var isInternal = !!attr.isInternalNote;

                return m('article', {
                    className: 'LinkRobinsSupport-reply' + (isInternal ? ' is-internal' : ''),
                    key:       'reply-' + reply.id,
                }, [
                    m('header', { className: 'LinkRobinsSupport-reply-header' }, [
                        user ? m('span', { className: 'LinkRobinsSupport-reply-author' },
                            user.attributes.displayName || user.attributes.username) : null,
                        m('span', { className: 'LinkRobinsSupport-reply-date' },
                            formatDate(attr.createdAt)),
                        isInternal ? m('span', { className: 'LinkRobinsSupport-reply-internalBadge' }, [
                            m('i', { className: 'fas fa-lock' }), ' Internal note',
                        ]) : null,
                    ]),
                    m('div', {
                        className: 'LinkRobinsSupport-reply-body',
                        oncreate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) {} },
                        onupdate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) {} },
                    }),
                ]);
            }

            _renderReplyForm() {
                var self = this;
                var canPostInternal = !!(self.ticket && self.ticket.attributes && self.ticket.attributes.canPostInternalNote);
                var canSubmit = !self.posting && self.replyText.trim() !== '';
                var canUpload = !!(app.forum && typeof app.forum.attribute === 'function' && app.forum.attribute('fof-upload.canUpload'));

                return m('div', { className: 'LinkRobinsSupport-replyForm' }, [
                    m('textarea', {
                        className:   'FormControl LinkRobinsSupport-body',
                        rows:        5,
                        value:       self.replyText,
                        disabled:    self.posting,
                        placeholder: self.replyIsInternal
                            ? 'Internal note (only staff will see this)…'
                            : 'Write a reply…',
                        oninput:     function (e) { self.replyText = e.target.value; },
                    }),

                    // Upload status / errors (shown above the action row so
                    // they're visible without scrolling).
                    self.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' },
                        self.uploadError) : null,
                    self.uploadingCount > 0 ? m('div', { className: 'LinkRobinsSupport-uploadStatus' },
                        'Uploading ' + self.uploadingCount + ' file' +
                        (self.uploadingCount === 1 ? '' : 's') + '…') : null,

                    m('div', { className: 'LinkRobinsSupport-replyForm-actions' }, [
                        canUpload ? m('label', { className: 'Button Button--default LinkRobinsSupport-attachBtn' }, [
                            m('i', { className: 'fas fa-paperclip' }),
                            ' Attach files',
                            m('input', {
                                type:     'file',
                                multiple: true,
                                style:    'display:none;',
                                disabled: self.posting || self.uploadingCount > 0,
                                onchange: function (e) {
                                    var files = e.target.files;
                                    if (files && files.length) {
                                        self._uploadFiles(files);
                                    }
                                    // Reset input so the same file can be
                                    // selected again after a failed upload.
                                    try { e.target.value = ''; } catch (err) {}
                                },
                            }),
                        ]) : null,
                        canPostInternal ? m('label', { className: 'LinkRobinsSupport-internalToggle' }, [
                            m('input', {
                                type:    'checkbox',
                                checked: self.replyIsInternal,
                                disabled: self.posting,
                                onchange: function (e) { self.replyIsInternal = !!e.target.checked; },
                            }),
                            ' Internal note',
                        ]) : null,
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  !canSubmit,
                            onclick:   function () { self._postReply(); },
                        }, self.posting ? 'Posting…' : 'Post reply'),
                    ]),
                ]);
            }

            _uploadFiles(files) {
                return uploadFilesToBody(this, files, 'replyText');
            }

            _postReply() {
                var self = this;
                self.posting = true;
                m.redraw();
                postReply(self.ticket.id, self.replyText, self.replyIsInternal)
                    .then(function () {
                        self.replyText       = '';
                        self.replyIsInternal = false;
                        self.uploadError     = null;
                        self.uploadingCount  = 0;
                        self.posting         = false;
                        self._load();
                    })
                    .catch(function (err) {
                        self.posting = false;
                        console.error('[linkrobins/support] reply failed:', err);
                        try { alert('Could not post reply.'); } catch (e) {}
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
