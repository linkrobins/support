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

    // Tell flarum/tags to skip rendering its per-tag list in the
    // IndexSidebar. The Tags extension reads `app.current.get('noTagsList')`
    // at navItems() render time -- when it's true, the long per-tag list
    // is omitted but the standalone "Tags" link is still added (so users
    // can still jump to /tags). We call this from every support page's
    // oninit; Flarum constructs a fresh PageState per navigation in
    // Page.oninit() above, so this flag never leaks to non-support pages.
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
            // ?include matches what fetchTicket asks for so the response
            // carries the updated assignedStaff user (plus category/owner)
            // inside `included`. Without this, JSON:API spec lets the
            // server omit related resources -- and Flarum does -- which
            // means relatedAssignedStaff() returns null and the label
            // renders as "Unassigned" until the page reloads, even though
            // ticket.relationships.assignedStaff.data.id was updated.
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
        try { Page             = flarum.reg.get('core', 'common/components/Page'); }             catch (e) {}
        try { LinkButton       = flarum.reg.get('core', 'common/components/LinkButton'); }       catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }           catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}
        try { PageStructure    = flarum.reg.get('core', 'forum/components/PageStructure'); }     catch (e) {}
        try { IndexSidebar     = flarum.reg.get('core', 'forum/components/IndexSidebar'); }      catch (e) {}
        try { SelectDropdown   = flarum.reg.get('core', 'common/components/SelectDropdown'); }   catch (e) {}
        try { ItemListCtor     = flarum.reg.get('core', 'common/utils/ItemList'); }              catch (e) {}

        if (!Page) {
            console.error('[linkrobins/support] Page component not available; aborting.');
            return;
        }

        // Build the support sidebar class first because the pages need it
        // as a constructor argument. If any of the deps are missing we
        // pass null and the pages render their content directly (no
        // sidebar wrapper, no "New ticket" button accessible from the
        // sidebar) -- this is a degraded layout but the page still
        // works on a Flarum build that doesn't expose one of these
        // components. Users in that fallback path can still reach the
        // compose page via the route URL directly.
        var SupportIndexSidebar = (IndexSidebar && LinkButton && SelectDropdown && ItemListCtor)
            ? makeSupportIndexSidebar(IndexSidebar, LinkButton, Button, SelectDropdown, ItemListCtor)
            : null;

        var IndexPage   = makeIndexPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar);
        var ComposePage = makeComposePage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar);
        var ShowPage    = makeShowPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar);

        // Route ordering matters: static paths first, then `:status`,
        // then the catch-all `:id`. Mithril matches in registration
        // order, so /support/new and /support/status/open would otherwise
        // be claimed by the wider /support/:id pattern.
        app.routes['linkrobins-support.index']    = { path: BASE_PATH,                       component: IndexPage };
        app.routes['linkrobins-support.compose']  = { path: BASE_PATH + '/new',              component: ComposePage };
        app.routes['linkrobins-support.filtered'] = { path: BASE_PATH + '/status/:status',   component: IndexPage };
        app.routes['linkrobins-support.show']     = { path: BASE_PATH + '/:id',              component: ShowPage };

        // Register a thin SupportTicket model so Flarum's store can
        // hydrate `notification.subject()` when it surfaces a
        // linkrobins-support-tickets resource. Without this, the
        // notification dropdown would render "Unknown notification type"
        // and the subject().attribute() lookups in our notification
        // components would fail.
        //
        // IMPORTANT: Flarum's Model is an ES6 class, and ES6 classes can
        // only be subclassed with `class X extends Y` syntax. Using the
        // old ES5 prototype-chain pattern here (Model.apply(this) +
        // Object.create(Model.prototype)) throws
        //   "Class constructor a cannot be invoked without 'new'"
        // because V8 refuses to invoke a class constructor without `new`.
        // That error blocks the entire notification pipeline -- when the
        // notification dropdown tries to push a payload through the store
        // and the store calls `new SupportTicketModel()`, construction
        // fails synchronously, and the whole bell-dropdown never renders.
        try {
            var Model = flarum.reg.get('core', 'common/Model');
            if (Model && app.store && app.store.models && !app.store.models['linkrobins-support-tickets']) {
                var SupportTicketModel = class extends Model {};
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
        // discoverable for everyone. The link stays visible on support
        // pages too -- earlier versions hid it there on the theory that
        // the support's own sidebar would duplicate it, but the support
        // sidebar's filter items ("My tickets", "All", "Open", ...) are
        // a different thing from the generic entry-point link, and
        // hiding "Support" only made it harder to navigate back to the
        // default view from a filtered route.
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

    // --- Sidebar filter metadata ---------------------------------------

    // Single source of truth for the sidebar's filter items and the
    // index page's filter state. `id` doubles as the URL segment
    // (/support/status/<id>) and the server-side filter[status] value
    // for actual statuses. The non-status entries ('mine', 'all') are
    // resolved specially in SupportIndexPage._load().
    //
    // Order here is the order shown in the sidebar.
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
        // 'mine' is the default index route, so it has no /status/... suffix.
        // Everything else lives under /status/<id>.
        var bp = basePath();
        if (id === 'mine') return bp + BASE_PATH;
        return bp + BASE_PATH + '/status/' + id;
    }

    // --- Support sidebar -----------------------------------------------

    function makeSupportIndexSidebar(IndexSidebar, LinkButton, Button, SelectDropdown, ItemListCtor) {
        return class SupportIndexSidebar extends IndexSidebar {
            // The whole sidebar: a primary "New ticket" button, a
            // SelectDropdown wrapping our nav items, then any items
            // contributed by the parent IndexSidebar (so users still see
            // "All Discussions", Tags, etc., when they're on a support
            // page).
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

                // Nav items dropdown -- exactly the same shape as the
                // forum-side IndexSidebar uses for "All Discussions",
                // "Tags", etc. Wrapping in SelectDropdown gives us the
                // mobile-friendly collapsing behavior that Flarum's
                // sidebars use everywhere else.
                //
                // defaultLabel is what SelectDropdown shows on the
                // toggle button when no child item has `active: true`.
                // Without it, the toggle would render with just the
                // caret arrow and no text -- this is exactly what
                // happens on ticket detail and compose pages, where we
                // pass activeFilter: null (no filter is "active" because
                // the user is viewing a specific ticket, not a filtered
                // list). Falling back to "Support" gives the toggle a
                // meaningful label in those contexts. On filter routes
                // (/support, /support/status/open, etc) the active
                // filter's label is used instead, which matches what
                // Flarum's own /all and /tags pages do.
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
                // Start from the parent IndexSidebar's nav items so users
                // still see "All Discussions" / Tags / etc when they're
                // browsing tickets. Wrap in try/catch because some pages
                // do not set up the parent state the way IndexSidebar
                // expects.
                var items;
                try {
                    items = super.navItems();
                } catch (e) {
                    console.warn('[linkrobins/support] super.navItems() threw, falling back:', e);
                    items = new ItemListCtor();
                }
                if (!items) return new ItemListCtor();

                // Defense in depth: even though we set noTagsList=true in
                // every support page's oninit, if that didn't take effect
                // for some reason (e.g. ordering), the tags extension's
                // navItems contribution emits a `separator` item just
                // before the tag list. Strip it so we don't see a lone
                // horizontal rule between the inherited forum items and
                // our support filter section.
                try {
                    if (typeof items.has === 'function' && items.has('separator')
                        && typeof items.remove === 'function') {
                        items.remove('separator');
                    }
                } catch (e) {}

                var canHandle = canHandleSupportTickets();
                // activeFilter can legitimately be null (on a ticket
                // detail page or the compose page -- those aren't a
                // filter view at all). When null, we don't want "My
                // tickets" to highlight just because that's the default
                // filter id; instead, no item is active. We only fall
                // back to 'mine' when the caller passes undefined
                // (which would mean "I didn't specify"), not when they
                // explicitly pass null (which means "no filter").
                var activeAttr = (this.attrs && Object.prototype.hasOwnProperty.call(this.attrs, 'activeFilter'))
                    ? this.attrs.activeFilter
                    : 'mine';
                var currentFilter = activeAttr; // may be null (= nothing active)

                // Section heading. -10 places it below the inherited
                // forum items, separating "All Discussions / Tags" from
                // the support filters visually.
                items.add(
                    'supportHeading',
                    m('h4', { className: 'LinkRobinsSupport-sidebar-sectionHeading' }, 'Support'),
                    -10
                );

                // Filter items. Non-staff users only see "My tickets"
                // (the backend rejects any other filter for them anyway).
                FILTER_OPTIONS.forEach(function (opt, i) {
                    if (opt.staffOnly && !canHandle) return;
                    items.add(
                        'support-filter-' + opt.id,
                        m(LinkButton, {
                            href:   filterHrefFor(opt.id),
                            icon:   opt.icon,
                            // We pass active explicitly so it works both
                            // for /support (mine, where m.route matches
                            // the index path) and the /support/status/...
                            // routes. LinkButton's auto-detection would
                            // also work but this avoids edge cases when
                            // we're on /support/<id> (a ticket detail).
                            active: currentFilter === opt.id,
                        }, opt.label),
                        -11 - i
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
                // The active filter comes from the route param (set by
                // /support/status/:status) or defaults to 'mine' for
                // /support. The sidebar links navigate between routes
                // rather than mutating local state, so this stays in
                // sync naturally on navigation.
                this.filter = this._filterFromAttrs(this.attrs);
                try { app.setTitle('Support'); } catch (e) {}
                this._lastLoadedFilter = this.filter;
                this._load();
            }

            // Mithril does NOT re-run oninit when only the route attrs
            // change for the same component class. We detect a filter
            // change here and re-load. (For comparison: when the user
            // clicks "Open" while on /support, Mithril rebuilds with
            // attrs.status='open' but the existing IndexPage instance
            // is reused.)
            onbeforeupdate(vnode) {
                var nextFilter = this._filterFromAttrs(vnode.attrs);
                if (nextFilter !== this._lastLoadedFilter) {
                    this.filter = nextFilter;
                    this._lastLoadedFilter = nextFilter;
                    // Defer the actual load to a microtask so onbeforeupdate
                    // doesn't run a fetch synchronously during a redraw.
                    var self = this;
                    Promise.resolve().then(function () { self._load(); });
                }
                return true;
            }

            // Translate route attrs into a filter id from FILTER_OPTIONS.
            // Defaults to 'mine' when no status is given. Unknown values
            // (e.g. a typo'd URL) also fall back to 'mine' so the page
            // doesn't render against a filter the server would reject.
            _filterFromAttrs(attrs) {
                var s = attrs && attrs.status;
                if (!s) return 'mine';
                for (var i = 0; i < FILTER_OPTIONS.length; i++) {
                    if (FILTER_OPTIONS[i].id === s) return s;
                }
                return 'mine';
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
                var self = this;
                var content = m('div', { className: 'LinkRobinsSupport-container' }, [
                    self._renderHeader(),
                    self._renderList(),
                ]);

                // Render with PageStructure so the SupportIndexSidebar
                // appears alongside the content (and collapses on mobile
                // into the same SelectDropdown menu Flarum's other index
                // pages use).
                if (PageStructure && SupportIndexSidebar) {
                    return m(PageStructure, {
                        className: 'IndexPage LinkRobinsSupport-page',
                        sidebar:   function () { return self._renderSidebar(); },
                    }, content);
                }

                // Fallback when PageStructure isn't available -- render
                // the content without a sidebar. Filter switching is
                // only reachable via direct URL navigation in this path
                // (no nav UI is rendered). This path should not trigger
                // on Flarum 2 builds that expose PageStructure, which
                // is virtually all of them.
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
                // Header now only carries the page title. The "New
                // ticket" button moved to the sidebar (mirrors the blog's
                // Compose placement), and the filter pills are replaced
                // by sidebar nav items.
                var label = this._headingFor(this.filter);
                return m('header', { className: 'LinkRobinsSupport-header' }, [
                    m('h1', { className: 'LinkRobinsSupport-title' }, [
                        m('i', { className: 'fas fa-life-ring' }), ' ', label,
                    ]),
                ]);
            }

            // Heading shown in the page header. Reflects which filter the
            // user is currently viewing so the page title gives context
            // beyond "Support".
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

            // Render `inner` (typically the container div) inside the
            // support PageStructure so the sidebar (with My tickets /
            // filters / New ticket button) appears alongside the form.
            // Falls back to plain wrapping when PageStructure isn't
            // available -- this keeps the page usable on Flarum builds
            // that don't expose the component.
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

    function makeShowPage(Page, LoadingIndicator, PageStructure, SupportIndexSidebar) {
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

            // Render `inner` (typically the container div) inside the
            // support PageStructure so the sidebar appears alongside the
            // ticket detail. Falls back to plain wrapping when
            // PageStructure isn't available.
            //
            // Active filter is null on a ticket detail page: the user
            // navigated into a specific ticket, they're not viewing a
            // filtered list. Nothing in the sidebar should highlight as
            // "active" beyond the New-ticket button.
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

                return self._wrap(
                    m('div', { className: 'LinkRobinsSupport-container' }, [
                        m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-ticket-header' }, [
                            // Title row: the ticket subject + status badge.
                            // The "back" arrow that used to sit at the
                            // start of this row was removed: the sidebar
                            // now provides primary navigation (My tickets,
                            // All, filtered status views), and the
                            // browser back button covers the remaining
                            // case. Keeping the back arrow here on top of
                            // that just adds visual noise.
                            m('div', { className: 'LinkRobinsSupport-ticket-titleRow' }, [
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

                // Status is now a select dropdown instead of a row of
                // buttons. The dropdown's selected value tracks the
                // current status, and onchange fires _setStatus() with
                // the new value. We disable the select while an update
                // is in flight so users can't queue a second change on
                // top of the first.
                return m('div', { className: 'LinkRobinsSupport-staffBar' }, [
                    m('label', { className: 'LinkRobinsSupport-staffBar-statusGroup' }, [
                        m('span', { className: 'LinkRobinsSupport-staffBar-label' }, 'Set status:'),
                        m('select', {
                            className: 'FormControl LinkRobinsSupport-staffBar-statusSelect',
                            value:     attr.status,
                            disabled:  self.updating,
                            onchange:  function (e) {
                                var next = e.target.value;
                                // No-op if the user picks the current
                                // status; protects against accidental
                                // change events triggering a needless
                                // PATCH.
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
