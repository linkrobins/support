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

    function suppressTagsList() {
        try {
            if (app.current && typeof app.current.set === 'function') {
                app.current.set('noTagsList', true);
            }
        } catch (e) {}
    }

    function supportAppealBanned() {
        try {
            return !!readForumAttribute('supportAppealBanned');
        } catch (e) { return false; }
    }

    function isUserSuspended() {
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

    function relatedEditedBy(reply, included) {
        var rel = reply && reply.relationships && reply.relationships.editedBy && reply.relationships.editedBy.data;
        if (!rel) return null;
        return findIncluded(included, 'users', rel.id);
    }

    function showError(message) {
        try {
            if (app && app.alerts && typeof app.alerts.show === 'function') {
                app.alerts.show({ type: 'error' }, message);
                return;
            }
        } catch (e) {}
        // Fallback when the alert system isn't available. Must NOT call
        // showError again (that recurses infinitely and overflows the stack);
        // log to the console instead.
        try { console.error('[linkrobins/support] ' + message); } catch (e) {}
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
                include: 'user,editedBy',
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
            params: { include: 'user,category,assignedStaff' },
            body:   { data: data },
        });
    }

    // --- Status display helpers -----------------------------------------

    var STATUS_LABELS = {
        open:           'Open',
        in_progress:    'In progress',
        awaiting_user:  'Awaiting response',
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
        var IndexSidebar  = null;
        var SelectDropdown = null;
        var ItemListCtor   = null;
        var Separator      = null;
        try { Page             = flarum.reg.get('core', 'common/components/Page'); }             catch (e) {}
        try { LinkButton       = flarum.reg.get('core', 'common/components/LinkButton'); }       catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }           catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}
        try { PageStructure    = flarum.reg.get('core', 'forum/components/PageStructure'); }     catch (e) {}
        try { IndexSidebar     = flarum.reg.get('core', 'forum/components/IndexSidebar'); }      catch (e) {}
        try { SelectDropdown   = flarum.reg.get('core', 'common/components/SelectDropdown'); }   catch (e) {}
        try { ItemListCtor     = flarum.reg.get('core', 'common/utils/ItemList'); }              catch (e) {}
        try { Separator        = flarum.reg.get('core', 'common/components/Separator'); }        catch (e) {}
        var Dropdown = null;
        try { Dropdown         = flarum.reg.get('core', 'common/components/Dropdown'); }         catch (e) {}

        if (!Page) {
            console.error('[linkrobins/support] Page component not available; aborting.');
            return;
        }

        var SupportIndexSidebar = (IndexSidebar && LinkButton && SelectDropdown && ItemListCtor)
            ? makeSupportIndexSidebar(IndexSidebar, LinkButton, Button, SelectDropdown, ItemListCtor, Separator)
            : null;

        var IndexPage   = makeIndexPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar);
        var ComposePage = makeComposePage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar);
        var ShowPage    = makeShowPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar, Button, Dropdown);

        app.routes['linkrobins-support.index']    = { path: BASE_PATH,                       component: IndexPage };
        app.routes['linkrobins-support.compose']  = { path: BASE_PATH + '/new',              component: ComposePage };
        app.routes['linkrobins-support.filtered'] = { path: BASE_PATH + '/status/:status',   component: IndexPage };
        app.routes['linkrobins-support.show']     = { path: BASE_PATH + '/:id',              component: ShowPage };

        try {
            var Model = flarum.reg.get('core', 'common/Model');
            if (Model && app.store && app.store.models && !app.store.models['linkrobins-support-tickets']) {
                var SupportTicketModel = class extends Model {};
                app.store.models['linkrobins-support-tickets'] = SupportTicketModel;
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not register ticket model on store:', e);
        }

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

        try {
            var extMod0 = flarum.reg.get('core', 'common/extend');
            var extend0 = extMod0 && extMod0.extend;
            var NotificationGrid = flarum.reg.get('core', 'forum/components/NotificationGrid');
            if (NotificationGrid && typeof extend0 === 'function') {
                var t = function (key, fallback) {
                    try {
                        var out = app.translator.trans(key);
                        if (out && typeof out === 'string') return out;
                    } catch (e) {}
                    return fallback;
                };
                extend0(NotificationGrid.prototype, 'notificationTypes', function (items) {
                    items.add('linkrobinsSupportNewReply', {
                        name: 'linkrobinsSupportNewReply',
                        icon: 'fas fa-life-ring',
                        label: t(
                            'linkrobins-support.forum.settings.notify_new_reply_label',
                            'Someone replies to your support ticket'
                        ),
                    });
                    items.add('linkrobinsSupportNewTicket', {
                        name: 'linkrobinsSupportNewTicket',
                        icon: 'fas fa-ticket-alt',
                        label: t(
                            'linkrobins-support.forum.settings.notify_new_ticket_label',
                            'A new support ticket is opened'
                        ),
                    });
                });
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not extend NotificationGrid:', e);
        }

        try {
            var IndexSidebar2 = flarum.reg.get('core', 'forum/components/IndexSidebar');
            var extMod        = flarum.reg.get('core', 'common/extend');
            var extend        = extMod && extMod.extend;
            if (IndexSidebar2 && LinkButton && typeof extend === 'function') {
                extend(IndexSidebar2.prototype, 'navItems', function (items) {
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

    // --- Sidebar filter metadata ---------------------------------------

    var FILTER_OPTIONS = [
        { id: 'mine',          label: 'My tickets',     icon: 'fas fa-user',          staffOnly: false },
        { id: 'all',           label: 'All',            icon: 'fas fa-inbox',         staffOnly: true  },
        { id: 'open',          label: 'Open',           icon: 'fas fa-circle',        staffOnly: true  },
        { id: 'in_progress',   label: 'In progress',    icon: 'fas fa-spinner',       staffOnly: true  },
        { id: 'awaiting_user', label: 'Awaiting response',  icon: 'fas fa-clock',         staffOnly: true  },
        { id: 'resolved',      label: 'Resolved',       icon: 'fas fa-check-circle',  staffOnly: true  },
        { id: 'closed',        label: 'Closed',         icon: 'fas fa-times-circle',  staffOnly: true  },
    ];

    function filterHrefFor(id) {
        return basePath() + BASE_PATH + '/status/' + id;
    }

    // --- Support sidebar -----------------------------------------------

    function makeSupportIndexSidebar(IndexSidebar, LinkButton, Button, SelectDropdown, ItemListCtor, Separator) {
        return class SupportIndexSidebar extends IndexSidebar {
            items() {
                var items = new ItemListCtor();

                // "New ticket" primary button -- mirrors the blog's
                // "Compose" button placement.
                if (Button && canCreateSupportTicket()) {
                    var newHref = basePath() + BASE_PATH + '/new';
                    items.add(
                        'newTicket',
                        m(Button, {
                            icon:          'fas fa-plus',
                            className:     'Button Button--primary LinkRobinsSupport-newTicketButton',
                            itemClassName: 'App-primaryControl',
                            'aria-label':  'New ticket',
                            title:         'Open a new support ticket',
                            onclick:       function (e) {
                                safeNavigate(newHref, e);
                            },
                        }, 'New ticket'),
                        110
                    );
                }

                items.add(
                    'nav',
                    m(SelectDropdown, {
                        buttonClassName: 'Button',
                        className:       'App-titleControl',
                        defaultLabel:    'Support',
                    }, this.navItems().toArray()),
                    90
                );

                return items;
            }

            navItems() {

                var items;
                try {
                    items = super.navItems();
                } catch (e) {
                    console.warn('[linkrobins/support] super.navItems() threw, falling back:', e);
                    items = new ItemListCtor();
                }
                if (!items) return new ItemListCtor();

                try {
                    if (typeof items.has === 'function' && items.has('separator')
                        && typeof items.remove === 'function') {
                        items.remove('separator');
                    }
                } catch (e) {}

                var canHandle = canHandleSupportTickets();
                var activeAttr = (this.attrs && Object.prototype.hasOwnProperty.call(this.attrs, 'activeFilter'))
                    ? this.attrs.activeFilter
                    : 'mine';
                var currentFilter = activeAttr; // may be null (= nothing active)

                if (Separator) {
                    items.add(
                        'linkrobinsSupportSeparator',
                        m(Separator),
                        -11
                    );
                }

                FILTER_OPTIONS.forEach(function (opt, i) {
                    if (opt.staffOnly && !canHandle) return;
                    items.add(
                        'support-filter-' + opt.id,
                        m(LinkButton, {
                            href:   filterHrefFor(opt.id),
                            icon:   opt.icon,
                            active: currentFilter === opt.id,
                        }, opt.label),
                        -12 - i
                    );
                });

                return items;
            }
        };
    }

    // --- Index page -----------------------------------------------------

    function makeIndexPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar) {
        return class SupportIndexPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                suppressTagsList();
                this.loading  = true;
                this.error    = null;
                this.tickets  = [];
                this.included = [];
                this.filter = this._filterFromAttrs(this.attrs);
                try { app.setTitle('Support'); } catch (e) {}
                this._lastLoadedFilter = this.filter;
                this._load();
            }

            onbeforeupdate(vnode) {
                var nextFilter = this._filterFromAttrs(vnode.attrs);
                if (nextFilter !== this._lastLoadedFilter) {
                    this.filter = nextFilter;
                    this._lastLoadedFilter = nextFilter;

                    var self = this;
                    Promise.resolve().then(function () { self._load(); });
                }
                return true;
            }


            _filterFromAttrs(attrs) {
                var defaultFilter = canHandleSupportTickets() ? 'open' : 'mine';
                var s = attrs && attrs.status;
                if (!s) return defaultFilter;
                for (var i = 0; i < FILTER_OPTIONS.length; i++) {
                    if (FILTER_OPTIONS[i].id === s) return s;
                }
                return defaultFilter;
            }

            _load() {
                var self = this;
                self.loading = true;
                m.redraw();

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
                var self = this;
                var content = m('div', { className: 'LinkRobinsSupport-container' }, [
                    self._renderHeader(),
                    self._renderList(),
                ]);

                if (PageStructure && SupportIndexSidebar) {
                    return m(PageStructure, {
                        className: 'IndexPage LinkRobinsSupport-page',
                        sidebar:   function () { return self._renderSidebar(); },
                    }, content);
                }


                return m('div', { className: 'IndexPage LinkRobinsSupport-page' }, [
                    content,
                ]);
            }

            _renderSidebar() {
                try {
                    if (SupportIndexSidebar) {
                        return m(SupportIndexSidebar, {
                            className:    'LinkRobinsSupport-sidebar',
                            activeFilter: this.filter,
                        });
                    }
                } catch (e) {
                    console.error('[linkrobins/support] sidebar render failed:', e);
                }
                return null;
            }

            _renderHeader() {

                var label = this._headingFor(this.filter);
                return m('header', { className: 'LinkRobinsSupport-header' }, [
                    m('h1', { className: 'LinkRobinsSupport-title' }, [
                        m('i', { className: 'fas fa-life-ring' }), ' ', label,
                    ]),
                ]);
            }


            _headingFor(filter) {
                if (!filter || filter === 'mine') return 'Support';
                for (var i = 0; i < FILTER_OPTIONS.length; i++) {
                    if (FILTER_OPTIONS[i].id === filter) return FILTER_OPTIONS[i].label;
                }
                return 'Support';
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

    function makeComposePage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar) {
        return class SupportComposePage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                suppressTagsList();
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


            _wrap(inner) {
                var self = this;
                if (PageStructure && SupportIndexSidebar) {
                    return m(PageStructure, {
                        className: 'IndexPage LinkRobinsSupport-page',
                        sidebar:   function () {
                            return m(SupportIndexSidebar, {
                                className:    'LinkRobinsSupport-sidebar',
                                // No filter is "active" on the compose
                                // page -- they're filing a new ticket,
                                // not viewing a list. Pass null so all
                                // sidebar items render as inactive.
                                activeFilter: null,
                            });
                        },
                    }, inner);
                }
                return m('div', { className: 'IndexPage LinkRobinsSupport-page' }, inner);
            }

            view(vnode) {
                var self = this;

                if (supportAppealBanned() && isUserSuspended()) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' }, [
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
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' },
                            LoadingIndicator ? m(LoadingIndicator) : 'Loading...'
                        )
                    );
                }

                if (self.categories.length === 0) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' }, [
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

                return self._wrap(
                    m('div', { className: 'LinkRobinsSupport-container' }, [
                        m('header', { className: 'LinkRobinsSupport-header' }, [

                            m('h1', { className: 'LinkRobinsSupport-title' },
                                isUserSuspended() ? 'File an appeal' : 'New support ticket'),
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

                                    onkeydown: function (e) {
                                        var isSubmit = (e.key === 'Enter' || e.keyCode === 13)
                                            && (e.ctrlKey || e.metaKey);
                                        if (isSubmit && canSave) {
                                            e.preventDefault();
                                            self._submit();
                                        }
                                    },
                                }),
                                self.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' },
                                    self.uploadError) : null,
                                self.uploadingCount > 0 ? m('div', { className: 'LinkRobinsSupport-uploadStatus' },
                                    'Uploading ' + self.uploadingCount + ' file' +
                                    (self.uploadingCount === 1 ? '' : 's') + '…') : null,
                            ]),
                            m('div', { className: 'LinkRobinsSupport-form-actions' }, [

                                (app.forum && app.forum.attribute('fof-upload.canUpload')) ? m('span', {
                                    className: 'LinkRobinsSupport-attachBtnWrap',
                                }, [
                                    m('button', {
                                        type:      'button',
                                        className: 'Button Button--default LinkRobinsSupport-attachBtn',
                                        disabled:  self.saving || self.uploadingCount > 0,
                                        onclick:   function () {
                                            if (self._composeFileInput) self._composeFileInput.click();
                                        },
                                    }, [
                                        m('i', { className: 'fas fa-paperclip' }),
                                        ' Attach files',
                                    ]),
                                    m('input', {
                                        type:     'file',
                                        multiple: true,
                                        style:    'display:none;',
                                        disabled: self.saving || self.uploadingCount > 0,
                                        oncreate: function (vnode) { self._composeFileInput = vnode.dom; },
                                        onremove: function ()      { self._composeFileInput = null; },
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

    function makeShowPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar, Button, Dropdown) {
        return class SupportShowPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                suppressTagsList();
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

            _wrap(inner) {
                if (PageStructure && SupportIndexSidebar) {
                    return m(PageStructure, {
                        className: 'IndexPage LinkRobinsSupport-page',
                        sidebar:   function () {
                            return m(SupportIndexSidebar, {
                                className:    'LinkRobinsSupport-sidebar',
                                activeFilter: null,
                            });
                        },
                    }, inner);
                }
                return m('div', { className: 'IndexPage LinkRobinsSupport-page' }, inner);
            }

            view(vnode) {
                var self = this;
                if (self.loading) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' },
                            LoadingIndicator ? m(LoadingIndicator) : 'Loading...'
                        )
                    );
                }
                if (self.error || !self.ticket) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' }, [
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
                var isDeleted = !!attr.isDeleted;
                var canModerate = !!attr.canUpdate || !!attr.canDelete;

                return self._wrap(
                    m('div', { className: 'LinkRobinsSupport-container'
                        + (isDeleted ? ' LinkRobinsSupport-container--deleted' : '') }, [
                        m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-ticket-header' }, [

                            m('div', { className: 'LinkRobinsSupport-ticket-titleRow' }, [
                                m('h1', { className: 'LinkRobinsSupport-title' }, attr.subject),
                                statusBadge(attr.status),
                                isDeleted ? m('span', {
                                    className: 'LinkRobinsSupport-reply-deletedBadge',
                                }, [m('i', { className: 'fas fa-trash' }), ' Deleted']) : null,

                                canModerate ? self._renderTicketActions(attr) : null,
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
                    m('label', { className: 'LinkRobinsSupport-staffBar-statusGroup' }, [
                        m('span', { className: 'LinkRobinsSupport-staffBar-label' }, 'Set status:'),
                        m('select', {
                            className: 'FormControl LinkRobinsSupport-staffBar-statusSelect',
                            value:     attr.status,
                            disabled:  self.updating,
                            onchange:  function (e) {
                                var next = e.target.value;

                                if (next && next !== attr.status) {
                                    self._setStatus(next);
                                }
                            },
                        }, statuses.map(function (s) {
                            return m('option', { value: s }, STATUS_LABELS[s]);
                        })),
                    ]),
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

                            self.included = (self.included || []).concat(resp.included);
                        }
                        self.updating = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.updating = false;
                        console.error('[linkrobins/support] assignment update failed:', err);
                        showError('Could not update assignment.');
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
                        showError('Could not update status.');
                        m.redraw();
                    });
            }

            _renderReply(reply) {
                var self  = this;
                var attr  = reply.attributes || {};
                var user  = relatedUser(reply, self.repliesIncluded);
                var html  = attr.contentHtml || '';
                var isInternal = !!attr.isInternalNote;
                var isDeleted  = !!attr.isDeleted;
                var canEdit    = !!attr.canEdit;
                var canDelete  = !!attr.canDelete;
                var editedAt   = attr.editedAt;
                var editedBy   = relatedEditedBy(reply, self.repliesIncluded);

                if (!self._replyEditState) self._replyEditState = {};
                var state = self._replyEditState[reply.id] || null;
                var editing = !!(state && state.editing);
                var busy    = !!(state && state.busy);

                var classes = 'LinkRobinsSupport-reply';
                if (isInternal) classes += ' is-internal';
                if (isDeleted)  classes += ' is-deleted';

                return m('article', {
                    className: classes,
                    key:       'reply-' + reply.id,
                }, [
                    m('header', { className: 'LinkRobinsSupport-reply-header' }, [
                        user ? m('span', { className: 'LinkRobinsSupport-reply-author' },
                            user.attributes.displayName || user.attributes.username) : null,
                        m('span', { className: 'LinkRobinsSupport-reply-date' },
                            formatDate(attr.createdAt)),

                        editedAt ? m('span', {
                            className: 'LinkRobinsSupport-reply-edited',
                            title: 'Edited ' + formatDate(editedAt)
                                + (editedBy ? ' by ' + (editedBy.attributes.displayName || editedBy.attributes.username) : ''),
                        }, '(edited)') : null,

                        isDeleted ? m('span', { className: 'LinkRobinsSupport-reply-deletedBadge' }, [
                            m('i', { className: 'fas fa-trash' }), ' Deleted',
                        ]) : null,
                        (canEdit || canDelete) ? self._renderReplyActions(reply, isDeleted, editing, busy) : null,
                    ]),

                    editing
                        ? self._renderReplyEditor(reply, state)
                        : (isDeleted
                            ? m('div', {
                                className: 'LinkRobinsSupport-reply-body LinkRobinsSupport-reply-body--deleted',
                            }, 'This reply was deleted.')
                            : m('div', {
                                className: 'LinkRobinsSupport-reply-body',
                                oncreate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) {} },
                                onupdate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) {} },
                            })),
                ]);
            }

            _renderReplyActions(reply, isDeleted, editing, busy) {
                var self = this;
                var canEdit   = !!(reply.attributes && reply.attributes.canEdit);
                var canDelete = !!(reply.attributes && reply.attributes.canDelete);

                if (editing) {

                    return null;

                }


                var items = [];
                if (!isDeleted) {
                    if (canEdit) {
                        items.push(m(Button, {
                            icon:     'fas fa-pencil-alt',
                            disabled: busy,
                            onclick:  function () { self._beginEditReply(reply); },
                        }, 'Edit'));
                    }
                    if (canDelete) {
                        items.push(m(Button, {
                            icon:      'fas fa-trash',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._softDeleteReply(reply); },
                        }, 'Delete'));
                    }
                } else {
                    if (canDelete) {
                        items.push(m(Button, {
                            icon:     'fas fa-undo',
                            disabled: busy,
                            onclick:  function () { self._restoreReply(reply); },
                        }, 'Restore'));
                        items.push(m(Button, {
                            icon:      'fas fa-times',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._forceDeleteReply(reply); },
                        }, 'Delete forever'));
                    }
                }

                if (items.length === 0) return null;

                if (!Dropdown) {
                    return m('span', { className: 'LinkRobinsSupport-reply-actions' }, items);
                }

                return m('span', { className: 'LinkRobinsSupport-reply-actions' },
                    m(Dropdown, {
                        menuClassName:    'Dropdown-menu--right',
                        buttonClassName:  'Button Button--icon Button--flat LinkRobinsSupport-reply-actionsToggle',
                        icon:             'fas fa-ellipsis-h',
                        accessibleToggleLabel: 'Moderation actions',
                    }, items)
                );
            }

            _renderReplyEditor(reply, state) {
                var self = this;
                var canSave = !state.busy && state.draft.trim() !== '';

                return m('div', { className: 'LinkRobinsSupport-reply-editor' }, [
                    m('textarea', {
                        className:   'FormControl LinkRobinsSupport-body',
                        rows:        5,
                        value:       state.draft,
                        disabled:    state.busy,
                        oninput:     function (e) { state.draft = e.target.value; },
                        onkeydown:   function (e) {
                            var isSubmit = (e.key === 'Enter' || e.keyCode === 13)
                                && (e.ctrlKey || e.metaKey);
                            if (!isSubmit) return;
                            if (!state.busy && state.draft.trim() !== '') {
                                e.preventDefault();
                                self._saveEditReply(reply);
                            }
                        },
                    }),
                    m('div', { className: 'LinkRobinsSupport-reply-editor-actions' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button Button--default',
                            disabled:  state.busy,
                            onclick:   function () { self._cancelEditReply(reply); },
                        }, 'Cancel'),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  !canSave,
                            onclick:   function () { self._saveEditReply(reply); },
                        }, state.busy ? 'Saving…' : 'Save changes'),
                    ]),
                ]);
            }

            _beginEditReply(reply) {
                if (!this._replyEditState) this._replyEditState = {};
                var attr = reply.attributes || {};
                // Pre-fill the editor with the original markdown source so
                // editing preserves formatting. (Previously this stripped the
                // rendered HTML, which silently discarded all markdown.)
                var draft = typeof attr.content === 'string' ? attr.content : '';
                this._replyEditState[reply.id] = {
                    editing: true,
                    draft:   draft,
                    busy:    false,
                };
                m.redraw();
            }

            _cancelEditReply(reply) {
                if (this._replyEditState) delete this._replyEditState[reply.id];
                m.redraw();
            }

            _saveEditReply(reply) {
                var self = this;
                var state = self._replyEditState && self._replyEditState[reply.id];
                if (!state) return;
                state.busy = true;
                m.redraw();

                var payload = {
                    data: {
                        type:       'linkrobins-support-replies',
                        id:         String(reply.id),
                        attributes: { content: state.draft },
                    },
                };
                app.request({
                    method: 'PATCH',
                    url:    app.forum.attribute('apiUrl')
                        + '/linkrobins-support-replies/' + reply.id
                        + '?include=user,editedBy',
                    body:   payload,
                }).then(function (resp) {
                    self._replaceReply(reply.id, resp);
                    delete self._replyEditState[reply.id];
                    m.redraw();
                }).catch(function (err) {
                    state.busy = false;
                    console.error('[linkrobins/support] edit reply failed:', err);
                    showError('Could not save the edit.');
                    m.redraw();
                });
            }

            _softDeleteReply(reply) {
                var self = this;
                try {
                    if (!window.confirm('Soft-delete this reply? Staff can restore it later.')) return;
                } catch (e) {}
                self._patchReplyDeletedState(reply, true);
            }

            _restoreReply(reply) {
                this._patchReplyDeletedState(reply, false);
            }

            _patchReplyDeletedState(reply, isDeleted) {
                var self = this;
                self._setReplyBusy(reply.id, true);

                var payload = {
                    data: {
                        type:       'linkrobins-support-replies',
                        id:         String(reply.id),
                        attributes: { isDeleted: isDeleted },
                    },
                };
                app.request({
                    method: 'PATCH',
                    url:    app.forum.attribute('apiUrl')
                        + '/linkrobins-support-replies/' + reply.id
                        + '?include=user,editedBy',
                    body:   payload,
                }).then(function (resp) {
                    self._replaceReply(reply.id, resp);
                    self._setReplyBusy(reply.id, false);
                    m.redraw();
                }).catch(function (err) {
                    self._setReplyBusy(reply.id, false);
                    console.error('[linkrobins/support] toggle delete failed:', err);
                    showError(isDeleted ? 'Could not delete the reply.' : 'Could not restore the reply.');
                    m.redraw();
                });
            }

            _forceDeleteReply(reply) {
                var self = this;
                try {
                    if (!window.confirm('Permanently delete this reply? This cannot be undone.')) return;
                } catch (e) {}
                self._setReplyBusy(reply.id, true);

                app.request({
                    method: 'DELETE',
                    url:    app.forum.attribute('apiUrl')
                        + '/linkrobins-support-replies/' + reply.id,
                }).then(function () {
                    // Remove from local replies list.
                    self.replies = (self.replies || []).filter(function (r) {
                        return String(r.id) !== String(reply.id);
                    });
                    if (self._replyEditState) delete self._replyEditState[reply.id];
                    m.redraw();
                }).catch(function (err) {
                    self._setReplyBusy(reply.id, false);
                    console.error('[linkrobins/support] force delete failed:', err);
                    showError('Could not permanently delete the reply.');
                    m.redraw();
                });
            }

            _setReplyBusy(replyId, busy) {
                if (!this._replyEditState) this._replyEditState = {};
                var existing = this._replyEditState[replyId];
                if (existing) {
                    existing.busy = busy;
                } else if (busy) {
                    this._replyEditState[replyId] = { editing: false, draft: '', busy: true };
                }
                if (!busy && this._replyEditState[replyId]
                    && !this._replyEditState[replyId].editing) {
                    delete this._replyEditState[replyId];
                }
            }

            _replaceReply(replyId, response) {
                if (!response || !response.data) return;
                this.replies = (this.replies || []).map(function (r) {
                    return String(r.id) === String(replyId) ? response.data : r;
                });
                if (Array.isArray(response.included)) {
                    var existing = this.repliesIncluded || [];
                    // Index existing by type+id for de-dup.
                    var key = function (r) { return r.type + ':' + r.id; };
                    var byKey = {};
                    existing.forEach(function (r) { byKey[key(r)] = r; });
                    response.included.forEach(function (r) { byKey[key(r)] = r; });
                    this.repliesIncluded = Object.keys(byKey).map(function (k) { return byKey[k]; });
                }
            }

            // --- Ticket moderation -----------------------------------------

            _renderTicketActions(attr) {
                var self      = this;
                var canUpdate = !!attr.canUpdate;
                var canDelete = !!attr.canDelete;
                var isDeleted = !!attr.isDeleted;
                var busy      = !!self._ticketBusy;

                var items = [];
                if (!isDeleted) {
                    if (canUpdate) {
                        items.push(m(Button, {
                            icon:      'fas fa-trash',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._softDeleteTicket(); },
                        }, 'Delete ticket'));
                    }
                } else {
                    if (canUpdate) {
                        items.push(m(Button, {
                            icon:     'fas fa-undo',
                            disabled: busy,
                            onclick:  function () { self._restoreTicket(); },
                        }, 'Restore ticket'));
                    }

                    if (canDelete) {
                        items.push(m(Button, {
                            icon:      'fas fa-times',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._forceDeleteTicket(); },
                        }, 'Delete forever'));
                    }
                }

                if (items.length === 0) return null;

                if (!Dropdown) {
                    return m('span', { className: 'LinkRobinsSupport-ticket-actions' }, items);
                }

                return m('span', { className: 'LinkRobinsSupport-ticket-actions' },
                    m(Dropdown, {
                        menuClassName:    'Dropdown-menu--right',
                        buttonClassName:  'Button Button--icon Button--flat LinkRobinsSupport-reply-actionsToggle',
                        icon:             'fas fa-ellipsis-h',
                        accessibleToggleLabel: 'Ticket moderation actions',
                    }, items)
                );
            }

            _softDeleteTicket() {
                var self = this;
                try {
                    if (!window.confirm('Soft-delete this ticket? It will be hidden from the index and from the ticket owner; staff can restore it.')) return;
                } catch (e) {}
                self._patchTicketDeletedState(true);
            }

            _restoreTicket() {
                this._patchTicketDeletedState(false);
            }

            _patchTicketDeletedState(isDeleted) {
                var self = this;
                if (!self.ticket) return;
                self._ticketBusy = true;
                m.redraw();

                var payload = {
                    data: {
                        type:       'linkrobins-support-tickets',
                        id:         String(self.ticket.id),
                        attributes: { isDeleted: isDeleted },
                    },
                };
                app.request({
                    method: 'PATCH',
                    url:    app.forum.attribute('apiUrl')
                        + '/linkrobins-support-tickets/' + self.ticket.id
                        + '?include=user,category,assignedStaff',
                    body:   payload,
                }).then(function (resp) {
                    if (resp && resp.data) {
                        self.ticket = resp.data;
                        if (Array.isArray(resp.included)) self.included = resp.included;
                    }
                    self._ticketBusy = false;
                    m.redraw();
                }).catch(function (err) {
                    self._ticketBusy = false;
                    console.error('[linkrobins/support] ticket delete toggle failed:', err);
                    showError(isDeleted ? 'Could not delete the ticket.' : 'Could not restore the ticket.');
                    m.redraw();
                });
            }

            _forceDeleteTicket() {
                var self = this;
                if (!self.ticket) return;
                try {
                    if (!window.confirm('Permanently delete this ticket and all its replies? This cannot be undone.')) return;
                } catch (e) {}
                self._ticketBusy = true;
                m.redraw();

                app.request({
                    method: 'DELETE',
                    url:    app.forum.attribute('apiUrl')
                        + '/linkrobins-support-tickets/' + self.ticket.id,
                }).then(function () {
                    // After permanent deletion the ticket is gone --
                    // navigate back to the support index so the user
                    // isn't sitting on a stale page that 404s the
                    // next time it tries to refetch.
                    try { m.route.set(app.route('linkrobins-support.index')); } catch (e) {}
                }).catch(function (err) {
                    self._ticketBusy = false;
                    console.error('[linkrobins/support] ticket force delete failed:', err);
                    showError('Could not permanently delete the ticket.');
                    m.redraw();
                });
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
                        onkeydown: function (e) {
                            var isSubmit = (e.key === 'Enter' || e.keyCode === 13)
                                && (e.ctrlKey || e.metaKey);
                            if (!isSubmit) return;
                            var canNow = !self.posting && self.replyText.trim() !== '';
                            if (canNow) {
                                e.preventDefault();
                                self._postReply();
                            }
                        },
                    }),

                    self.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' },
                        self.uploadError) : null,
                    self.uploadingCount > 0 ? m('div', { className: 'LinkRobinsSupport-uploadStatus' },
                        'Uploading ' + self.uploadingCount + ' file' +
                        (self.uploadingCount === 1 ? '' : 's') + '…') : null,

                    m('div', { className: 'LinkRobinsSupport-replyForm-actions' }, [
                        canUpload ? m('span', {
                            className: 'LinkRobinsSupport-attachBtnWrap',
                        }, [
                            m('button', {
                                type:      'button',
                                className: 'Button Button--default LinkRobinsSupport-attachBtn',
                                disabled:  self.posting || self.uploadingCount > 0,
                                onclick:   function () {
                                    if (self._replyFileInput) self._replyFileInput.click();
                                },
                            }, [
                                m('i', { className: 'fas fa-paperclip' }),
                                ' Attach files',
                            ]),
                            m('input', {
                                type:     'file',
                                multiple: true,
                                style:    'display:none;',
                                disabled: self.posting || self.uploadingCount > 0,
                                oncreate: function (vnode) { self._replyFileInput = vnode.dom; },
                                onremove: function ()      { self._replyFileInput = null; },
                                onchange: function (e) {
                                    var files = e.target.files;
                                    if (files && files.length) {
                                        self._uploadFiles(files);
                                    }
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
                        showError('Could not post reply.');
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
