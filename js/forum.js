'use strict';

(function () {

    var BASE_PATH = '/support';

    // --- Helpers ---------------------------------------------------------

    // Translate a key under this extension's forum namespace. Strings live in
    // locale/en.yml (linkrobins-support.forum.*) so they're translatable; an
    // optional English fallback keeps the UI sensible if a key is ever missing.
    function tr(key, fallback, params) {
        try {
            var out = app.translator.trans('linkrobins-support.forum.' + key, params || {});
            if (typeof out === 'string' && out.indexOf('linkrobins-support.') !== 0) {
                return out;
            }
            if (out != null && typeof out !== 'string') {
                return out; // rich (vdom) translation
            }
        } catch (e) {}
        // Fall back to the inline English template. Interpolate {placeholder}
        // tokens ourselves so an unresolved/missing key never leaks raw braces
        // to the user (Flarum's translator throws or returns the bare key when
        // a translation can't be found). NB: never name a param `user` — the
        // core translator reserves it (extracts it, derives `username`), which
        // is what broke these strings before.
        var tmpl = fallback != null ? fallback : key;
        if (params) {
            tmpl = tmpl.replace(/\{(\w+)\}/g, function (whole, name) {
                return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
            });
        }
        return tmpl;
    }

    // Resolve Flarum's core TextEditor component -- the same Markdown editor
    // (toolbar + @mentions) used inside the composer. Returns null if it can't
    // be found, so callers fall back to a plain <textarea> and the UI keeps
    // working on stripped-down installs.
    function getTextEditor() {
        try {
            var mod = flarum.reg.get('core', 'common/components/TextEditor');
            return (mod && mod.default) || mod || null;
        } catch (e) {
            return null;
        }
    }

    // Render a username as a link to the user's profile. Accepts a raw API
    // user object (with .attributes); falls back to plain text if no username.
    function userLink(userObj) {
        var attrs = userObj && userObj.attributes ? userObj.attributes : null;
        if (!attrs) return '';
        var label = attrs.displayName || attrs.username || '';
        if (!attrs.username) return label;
        var href = basePath() + '/u/' + encodeURIComponent(attrs.username);
        var LinkC = null;
        try { LinkC = flarum.reg.get('core', 'common/components/Link'); } catch (e) {}
        return LinkC ? LinkC.component({ href: href }, label) : m('a', { href: href }, label);
    }

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

    // Upload files and append their BBCode to the compose body. When the
    // caller is backed by Flarum's TextEditor (an uncontrolled component that
    // owns its own textarea), pass `editorGetter` -- a function returning the
    // active editor driver -- so we insert into the live editor (whose oninput
    // syncs target[bodyKey] back for us) instead of mutating the string, which
    // the editor wouldn't see. Plain-textarea callers omit it.
    function uploadFilesToBody(target, files, bodyKey, editorGetter) {
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
                var editor = typeof editorGetter === 'function' ? editorGetter() : null;
                if (editor && typeof editor.insertAt === 'function' && editor.el) {
                    // Append at the end of the live editor; its oninput fires
                    // onchange, which keeps target[bodyKey] in sync.
                    var curVal = editor.el.value || '';
                    var lead = curVal && !curVal.endsWith('\n') ? '\n' : '';
                    editor.insertAt(curVal.length, lead + inserted + '\n');
                } else {
                    var existing = target[bodyKey] || '';
                    var sep = existing && !existing.endsWith('\n') ? '\n' : '';
                    target[bodyKey] = existing + sep + inserted + '\n';
                }
            } else {
                target.uploadError = tr('errors.upload_no_files', 'Upload returned no files. Please try again.');
            }
            m.redraw();
        }).catch(function (err) {
            target.uploadingCount = Math.max(0, target.uploadingCount - files.length);
            var msg = tr('errors.upload', 'Could not upload file.');
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
        open:           tr('status.open', 'Open'),
        in_progress:    tr('status.in_progress', 'In progress'),
        awaiting_user:  tr('status.awaiting_response', 'Awaiting response'),
        resolved:       tr('status.resolved', 'Resolved'),
        closed:         tr('status.closed', 'Closed'),
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
            if (typeof extend0 === 'function') {
                var t = function (key, fallback) {
                    try {
                        var out = app.translator.trans(key);
                        if (out && typeof out === 'string') return out;
                    } catch (e) {}
                    return fallback;
                };
                extend0('flarum/forum/components/NotificationGrid', 'notificationTypes', function (items) {
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

        // Appeal-ban toggle in the user's moderation controls dropdown (the
        // same menu as Suspend). Shown only to users with the
        // linkrobins-support.manage_appeal_bans permission.
        try {
            var extModUC = flarum.reg.get('core', 'common/extend');
            var extendUC = extModUC && extModUC.extend;
            var btnMod = flarum.reg.get('core', 'common/components/Button');
            var ButtonUC = (btnMod && btnMod.default) || btnMod;
            // UserControls is a plain object (not a component class), so we must
            // extend the object itself. The string form of extend() targets
            // `module.prototype`, which is undefined for a util object, so it
            // silently no-ops -- that's why the appeal-ban button never showed.
            var ucMod = flarum.reg.get('core', 'forum/utils/UserControls');
            var UserControls = (ucMod && ucMod.default) || ucMod;
            if (ButtonUC && UserControls && typeof extendUC === 'function') {
                extendUC(UserControls, 'moderationControls', function (items, user) {
                    if (!readForumAttribute('canManageSupportAppealBans')) return;
                    if (!user || typeof user.attribute !== 'function') return;
                    var banned = !!user.attribute('supportAppealBanned');
                    items.add('linkrobinsSupportAppealBan', m(ButtonUC, {
                        icon: banned ? 'fas fa-unlock' : 'fas fa-ban',
                        onclick: function () {
                            user.save({ supportAppealBanned: !banned }).then(function () {
                                m.redraw();
                            }).catch(function () {
                                showError(tr('user_controls.toggle_failed', 'Could not update the appeal-ban status.'));
                            });
                        },
                    }, banned
                        ? tr('user_controls.allow_appeals', 'Allow support appeals')
                        : tr('user_controls.disallow_appeals', 'Disallow support appeals')));
                });
            }
        } catch (e) {
            console.warn('[linkrobins/support] could not extend UserControls:', e);
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
                    }, tr('nav', 'Support')), 30);
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
                    return tr('notifications.reply_from', '{name} replied to your ticket', { name: from.displayName() });
                }
                return tr('notifications.reply_generic', 'Support replied to your ticket');
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
                var n = this.attrs && this.attrs.notification;
                var data = n && n.content && n.content();
                // Appeals get a distinct, more fitting glyph (gavel) instead of
                // the generic ticket icon.
                return (data && data.isAppeal) ? 'fas fa-gavel' : 'fas fa-ticket-alt';
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
                var who = (from && from.displayName) ? from.displayName() : tr('notifications.someone', 'A user');
                return isAppeal
                    ? tr('notifications.new_appeal', '{name} opened a new appeal', { name: who })
                    : tr('notifications.new_ticket', '{name} opened a new support ticket', { name: who });
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
        { id: 'mine',          label: tr('index.my_tickets', 'My tickets'),     icon: 'fas fa-user',          staffOnly: false },
        { id: 'all',           label: tr('index.filter_all', 'All'),            icon: 'fas fa-inbox',         staffOnly: true  },
        { id: 'open',          label: tr('status.open', 'Open'),           icon: 'fas fa-circle',        staffOnly: true  },
        { id: 'in_progress',   label: tr('status.in_progress', 'In progress'),    icon: 'fas fa-spinner',       staffOnly: true  },
        { id: 'awaiting_user', label: tr('status.awaiting_response', 'Awaiting response'),  icon: 'fas fa-clock',         staffOnly: true  },
        { id: 'resolved',      label: tr('status.resolved', 'Resolved'),       icon: 'fas fa-check-circle',  staffOnly: true  },
        { id: 'closed',        label: tr('status.closed', 'Closed'),         icon: 'fas fa-times-circle',  staffOnly: true  },
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
                            'aria-label':  tr('index.new_ticket', 'New ticket'),
                            title:         tr('index.new_ticket_tooltip', 'Open a new support ticket'),
                            onclick:       function (e) {
                                safeNavigate(newHref, e);
                            },
                        }, tr('index.new_ticket', 'New ticket')),
                        110
                    );
                }

                items.add(
                    'nav',
                    m(SelectDropdown, {
                        buttonClassName: 'Button',
                        className:       'App-titleControl',
                        defaultLabel:    tr('nav', 'Support'),
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
                try { app.setTitle(tr('nav', 'Support')); } catch (e) {}
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
                if (!filter || filter === 'mine') return tr('nav', 'Support');
                for (var i = 0; i < FILTER_OPTIONS.length; i++) {
                    if (FILTER_OPTIONS[i].id === filter) return FILTER_OPTIONS[i].label;
                }
                return tr('nav', 'Support');
            }

            _renderList() {
                var self = this;
                if (self.loading) {
                    return LoadingIndicator
                        ? m(LoadingIndicator)
                        : m('div', null, tr('common.loading', 'Loading…'));
                }
                if (self.error) {
                    return m('div', { className: 'LinkRobinsSupport-empty' },
                        tr('errors.load_tickets', 'Could not load tickets.'));
                }
                if (!self.tickets.length) {
                    return m('div', { className: 'LinkRobinsSupport-empty' },
                        canCreateSupportTicket()
                            ? tr('index.empty_own', 'No tickets yet. Click "New ticket" to open one.')
                            : tr('index.empty', 'No tickets to show.'));
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
                try { app.setTitle(tr('index.new_ticket', 'New ticket')); } catch (e) {}

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
                        // Only auto-select when there's a single category, so the
                        // picker (with descriptions) is shown whenever there's a
                        // real choice to make.
                        if (cats.length === 1) {
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
                                m('h1', { className: 'LinkRobinsSupport-title' }, tr('nav', 'Support'))
                            ),
                            m('div', { className: 'LinkRobinsSupport-empty LinkRobinsSupport-empty--blocked' },
                                tr('compose.appeal_banned', 'You are not permitted to file appeals. Please contact the site owner via another channel.')
                            ),
                        ])
                    );
                }

                if (self.loading) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' },
                            LoadingIndicator ? m(LoadingIndicator) : tr('common.loading', 'Loading…')
                        )
                    );
                }

                if (self.categories.length === 0) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' }, [
                            m('header', { className: 'LinkRobinsSupport-header' },
                                m('h1', { className: 'LinkRobinsSupport-title' }, tr('nav', 'Support'))
                            ),
                            m('div', { className: 'LinkRobinsSupport-empty' },
                                isUserSuspended()
                                    ? tr('compose.no_appeal_categories', 'No appeal categories are currently available.')
                                    : tr('compose.no_categories', 'No support categories have been set up yet. Please contact an admin.')
                            ),
                        ])
                    );
                }

                // Step 1 of the flow: a category picker showing each category's
                // description. Shown whenever no category has been chosen yet
                // (i.e. there's more than one to choose from). Selecting a card
                // advances to the form below.
                if (self.categoryId === '') {
                    return self._wrap(self._renderPicker());
                }

                var canSave = !self.saving
                    && self.subject.trim() !== ''
                    && self.body.trim() !== ''
                    && self.categoryId !== '';

                var TextEditor = getTextEditor();
                if (TextEditor && !self._composeComposer) self._composeComposer = {};
                // The new-ticket form keeps its own bottom "Submit ticket"
                // button (it covers subject + category + body), so we embed the
                // core editor purely for its Markdown toolbar / @mentions and
                // hide its built-in submit via the wrapper class (see forum.less).
                var bodyEditor = TextEditor
                    ? m('div', { className: 'LinkRobinsSupport-composeEditor' }, m(TextEditor, {
                        key:         'lr-support-compose',
                        composer:    self._composeComposer,
                        value:       self.body,
                        disabled:    self.saving,
                        placeholder: tr('compose.body_placeholder', 'Describe the issue in detail. Markdown is supported.'),
                        submitLabel: tr('compose.submit', 'Submit ticket'),
                        onchange:    function (v) { self.body = v; },
                        onsubmit:    function () {
                            if (!self.saving && self.subject.trim() !== ''
                                && self.body.trim() !== '' && self.categoryId !== '') {
                                self._submit();
                            }
                        },
                    }))
                    : m('textarea', {
                        className:   'FormControl LinkRobinsSupport-body',
                        rows:        10,
                        value:       self.body,
                        disabled:    self.saving,
                        placeholder: tr('compose.body_placeholder', 'Describe the issue in detail. Markdown is supported.'),
                        oninput:     function (e) { self.body = e.target.value; },
                        onkeydown: function (e) {
                            var isSubmit = (e.key === 'Enter' || e.keyCode === 13)
                                && (e.ctrlKey || e.metaKey);
                            if (isSubmit && canSave) {
                                e.preventDefault();
                                self._submit();
                            }
                        },
                    });

                return self._wrap(
                    m('div', { className: 'LinkRobinsSupport-container' }, [
                        m('header', { className: 'LinkRobinsSupport-header' }, [
                            self.categories.length > 1 ? m('button', {
                                type:      'button',
                                className: 'Button Button--link LinkRobinsSupport-backBtn',
                                disabled:  self.saving,
                                onclick:   function () { self._backToCategories(); },
                            }, [
                                m('i', { className: 'fas fa-chevron-left' }), ' ',
                                tr('compose.back_to_categories', 'Back to categories'),
                            ]) : null,
                            m('h1', { className: 'LinkRobinsSupport-title' },
                                isUserSuspended() ? tr('compose.title_appeal', 'File an appeal') : tr('compose.title', 'New support ticket')),
                            self._renderChosenCategory(),
                        ]),

                        self.error ? m('div', { className: 'Alert Alert--danger' }, [
                            m('span', { className: 'Alert-body' }, self._errorMessage()),
                        ]) : null,

                        m('div', { className: 'LinkRobinsSupport-form' }, [
                            m('div', { className: 'Form-group' }, [
                                m('label', null, tr('compose.subject_label', 'Subject')),
                                m('input', {
                                    type:        'text',
                                    className:   'FormControl',
                                    value:       self.subject,
                                    disabled:    self.saving,
                                    placeholder: tr('compose.subject_placeholder', 'Short summary of your issue'),
                                    maxlength:   200,
                                    oninput:     function (e) { self.subject = e.target.value; },
                                }),
                            ]),
                            m('div', { className: 'Form-group' }, [
                                m('label', null, tr('compose.message_label', 'Message')),
                                bodyEditor,
                                self.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' },
                                    self.uploadError) : null,
                                self.uploadingCount > 0 ? m('div', { className: 'LinkRobinsSupport-uploadStatus' },
                                    self.uploadingCount === 1
                                        ? tr('common.uploading_one', 'Uploading 1 file…')
                                        : tr('common.uploading_many', 'Uploading {count} files…', { count: self.uploadingCount })) : null,
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
                                        ' ', tr('action.attach_files', 'Attach files'),
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
                                }, self.saving ? tr('compose.submitting', 'Submitting…') : tr('compose.submit', 'Submit ticket')),
                            ]),
                        ]),
                    ])
                );
            }

            // Step 1: clickable category cards (icon + name + description).
            _renderPicker() {
                var self   = this;
                var appeal = isUserSuspended();
                return m('div', { className: 'LinkRobinsSupport-container' }, [
                    m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-header--picker' }, [
                        m('h1', { className: 'LinkRobinsSupport-title' },
                            appeal ? tr('compose.title_appeal', 'File an appeal') : tr('compose.title', 'New support ticket')),
                        m('p', { className: 'LinkRobinsSupport-pickerHint' },
                            appeal
                                ? tr('compose.choose_category_appeal', 'Choose an appeal category to get started.')
                                : tr('compose.choose_category', 'Choose a category to get started.')),
                    ]),
                    m('ul', { className: 'LinkRobinsSupport-categoryCards' },
                        self.categories.map(function (c) {
                            var a     = c.attributes || {};
                            var color = a.color || null;
                            return m('li', { className: 'LinkRobinsSupport-categoryCards-item' },
                                m('button', {
                                    type:      'button',
                                    className: 'LinkRobinsSupport-categoryCard',
                                    onclick:   function () { self._chooseCategory(String(c.id)); },
                                }, [
                                    m('span', {
                                        className: 'LinkRobinsSupport-categoryCard-icon',
                                        style:     color ? ('color:' + color) : null,
                                    }, m('i', { className: a.icon || 'fas fa-life-ring' })),
                                    m('span', { className: 'LinkRobinsSupport-categoryCard-text' }, [
                                        m('span', { className: 'LinkRobinsSupport-categoryCard-name' }, a.name || ''),
                                        a.description
                                            ? m('span', { className: 'LinkRobinsSupport-categoryCard-desc' }, a.description)
                                            : null,
                                    ]),
                                ])
                            );
                        })
                    ),
                ]);
            }

            // The selected-category chip shown in the form header (step 2).
            _renderChosenCategory() {
                var c = this._chosenCategory();
                if (!c) return null;
                var a     = c.attributes || {};
                var color = a.color || null;
                return m('div', { className: 'LinkRobinsSupport-chosenCategory' }, [
                    a.icon ? m('i', {
                        className: a.icon + ' LinkRobinsSupport-chosenCategory-icon',
                        style:     color ? ('color:' + color) : null,
                    }) : null,
                    m('span', { className: 'LinkRobinsSupport-chosenCategory-name' }, a.name || ''),
                ]);
            }

            _chosenCategory() {
                var id = String(this.categoryId);
                for (var i = 0; i < this.categories.length; i++) {
                    if (String(this.categories[i].id) === id) return this.categories[i];
                }
                return null;
            }

            _chooseCategory(id) {
                this.categoryId = id;
                this.error      = null;
                m.redraw();
            }

            _backToCategories() {
                this.categoryId = '';
                this.error      = null;
                m.redraw();
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return tr('errors.unknown', 'Unknown error.');
                try {
                    var errors = err.response && err.response.errors;
                    if (errors && errors[0]) {
                        return errors[0].detail || errors[0].title || tr('errors.submit', 'Could not submit.');
                    }
                } catch (e) {}
                return tr('errors.submit_ticket', 'Could not submit the ticket.');
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
                var self = this;
                return uploadFilesToBody(this, files, 'body', function () {
                    return self._composeComposer && self._composeComposer.editor;
                });
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
                try { app.setTitle(tr('show.title', 'Ticket')); } catch (e) {}
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
                            LoadingIndicator ? m(LoadingIndicator) : tr('common.loading', 'Loading…')
                        )
                    );
                }
                if (self.error || !self.ticket) {
                    return self._wrap(
                        m('div', { className: 'LinkRobinsSupport-container' }, [
                            m('header', { className: 'LinkRobinsSupport-header' }, [
                                m('h1', { className: 'LinkRobinsSupport-title' }, tr('show.title', 'Ticket')),
                                m('a', {
                                    href:    basePath() + BASE_PATH,
                                    className: 'Button Button--text',
                                    onclick: function (e) { safeNavigate(basePath() + BASE_PATH, e); },
                                }, [m('i', { className: 'fas fa-arrow-left' }), ' Back']),
                            ]),
                            m('div', { className: 'LinkRobinsSupport-empty' },
                                tr('errors.load_ticket', 'Could not load this ticket. It may have been deleted, or you may not have permission to view it.')
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
                                creator ? m('span', null, [
                                    tr('show.opened_by', 'Opened by'), ' ', userLink(creator),
                                ]) : null,
                                m('span', null, formatDate(attr.createdAt)),
                            ]),
                            attr.decision ? m('div', { className: 'LinkRobinsSupport-decision' }, [
                                tr('show.decision', 'Decision:'), ' ',
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
                                    ? tr('show.closed_notice', 'This ticket has been closed and cannot be replied to.')
                                    : tr('show.cannot_reply', 'You cannot reply to this ticket.'))
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
                        m('span', { className: 'LinkRobinsSupport-staffBar-label' }, tr('show.closed_badge', 'Closed ticket')),
                        this._renderAssignmentRow(false),
                    ]);
                }
                var statuses = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];


                return m('div', { className: 'LinkRobinsSupport-staffBar' }, [
                    m('label', { className: 'LinkRobinsSupport-staffBar-statusGroup' }, [
                        m('span', { className: 'LinkRobinsSupport-staffBar-label' }, tr('staff.set_status', 'Set status:')),
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
                    ? tr('show.assigned_to', 'Assigned to') + ' ' + (assigned.attributes && assigned.attributes.username || ('user #' + assigned.id))
                    : tr('show.unassigned', 'Unassigned');

                return m('div', { className: 'LinkRobinsSupport-staffBar-assign' }, [
                    m('span', { className: 'LinkRobinsSupport-staffBar-label' }, label),
                    allowChanges && !actorIsAssigned
                        ? m('button', {
                            type:      'button',
                            className: 'Button Button--default LinkRobinsSupport-staffBtn',
                            disabled:  self.updating,
                            onclick:   function () { self._claim(); },
                        }, tr('action.claim', 'Claim'))
                        : null,
                    allowChanges && assigned
                        ? m('button', {
                            type:      'button',
                            className: 'Button Button--default LinkRobinsSupport-staffBtn',
                            disabled:  self.updating,
                            onclick:   function () { self._unassign(); },
                        }, tr('action.unassign', 'Unassign'))
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
                        showError(tr('errors.update_assignment', 'Could not update assignment.'));
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
                        showError(tr('errors.update_status', 'Could not update status.'));
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
                            userLink(user)) : null,
                        m('span', { className: 'LinkRobinsSupport-reply-date' },
                            formatDate(attr.createdAt)),

                        editedAt ? m('span', {
                            className: 'LinkRobinsSupport-reply-edited',
                            title: editedBy
                                ? tr('reply.edited_by', 'Edited {date} by {name}', { date: formatDate(editedAt), name: (editedBy.attributes.displayName || editedBy.attributes.username) })
                                : tr('reply.edited_at', 'Edited {date}', { date: formatDate(editedAt) }),
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
                            }, tr('reply.deleted_notice', 'This reply was deleted.'))
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
                        }, tr('action.edit', 'Edit')));
                    }
                    if (canDelete) {
                        items.push(m(Button, {
                            icon:      'fas fa-trash',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._softDeleteReply(reply); },
                        }, tr('action.delete', 'Delete')));
                    }
                } else {
                    if (canDelete) {
                        items.push(m(Button, {
                            icon:     'fas fa-undo',
                            disabled: busy,
                            onclick:  function () { self._restoreReply(reply); },
                        }, tr('action.restore', 'Restore')));
                        items.push(m(Button, {
                            icon:      'fas fa-times',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._forceDeleteReply(reply); },
                        }, tr('action.delete_forever', 'Delete forever')));
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
                        accessibleToggleLabel: tr('reply.mod_actions', 'Moderation actions'),
                    }, items)
                );
            }

            _renderReplyEditor(reply, state) {
                var self = this;
                var canSave = !state.busy && state.draft.trim() !== '';

                var TextEditor = getTextEditor();
                if (TextEditor) {
                    // Use Flarum's own composer editor so editing a reply gets
                    // the same Markdown toolbar / @mention autocomplete as
                    // posting anywhere else on the forum. TextEditor is
                    // uncontrolled (it owns its textarea), but the editor is
                    // mounted fresh when editing begins and torn down on
                    // save/cancel, so there's no external value to sync. The
                    // `composer` attr is just a holder TextEditor stashes its
                    // driver on; the `key` forces a clean remount per reply.
                    if (!state._composer) state._composer = {};
                    return m('div', { className: 'LinkRobinsSupport-reply-editor' }, [
                        // The keyed editor must be the sole child of an unkeyed
                        // wrapper: mithril forbids mixing keyed and unkeyed
                        // siblings in one array, and the actions row below is
                        // unkeyed. (The key lets us remount per reply.)
                        m('div', { className: 'LinkRobinsSupport-editorWrap' }, m(TextEditor, {
                            key:         'lr-support-edit-' + reply.id,
                            composer:    state._composer,
                            value:       state.draft,
                            disabled:    state.busy,
                            placeholder: tr('reply.placeholder', 'Write a reply…'),
                            submitLabel: state.busy
                                ? tr('action.saving', 'Saving…')
                                : tr('action.save_changes', 'Save changes'),
                            onchange:    function (v) { state.draft = v; },
                            onsubmit:    function () {
                                if (!state.busy && state.draft.trim() !== '') {
                                    self._saveEditReply(reply);
                                }
                            },
                        })),
                        m('div', { className: 'LinkRobinsSupport-reply-editor-actions' }, [
                            m('button', {
                                type:      'button',
                                className: 'Button Button--link',
                                disabled:  state.busy,
                                onclick:   function () { self._cancelEditReply(reply); },
                            }, tr('action.cancel', 'Cancel')),
                            // Own submit button (the editor's built-in one is
                            // hidden). Ctrl+Enter also saves via onsubmit.
                            m('button', {
                                type:      'button',
                                className: 'Button Button--primary',
                                disabled:  !canSave,
                                onclick:   function () { self._saveEditReply(reply); },
                            }, state.busy ? tr('action.saving', 'Saving…') : tr('action.save_changes', 'Save changes')),
                        ]),
                    ]);
                }

                // Fallback: plain textarea when the core editor is unavailable.
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
                        }, tr('action.cancel', 'Cancel')),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  !canSave,
                            onclick:   function () { self._saveEditReply(reply); },
                        }, state.busy ? tr('action.saving', 'Saving…') : tr('action.save_changes', 'Save changes')),
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
                    showError(tr('errors.save_edit', 'Could not save the edit.'));
                    m.redraw();
                });
            }

            _softDeleteReply(reply) {
                var self = this;
                try {
                    if (!window.confirm(tr('confirm.soft_delete_reply', 'Soft-delete this reply? Staff can restore it later.'))) return;
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
                    showError(isDeleted ? tr('errors.delete_reply', 'Could not delete the reply.') : tr('errors.restore_reply', 'Could not restore the reply.'));
                    m.redraw();
                });
            }

            _forceDeleteReply(reply) {
                var self = this;
                try {
                    if (!window.confirm(tr('confirm.delete_reply_forever', 'Permanently delete this reply? This cannot be undone.'))) return;
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
                    showError(tr('errors.delete_reply_forever', 'Could not permanently delete the reply.'));
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
                        }, tr('ticket.delete', 'Delete ticket')));
                    }
                } else {
                    if (canUpdate) {
                        items.push(m(Button, {
                            icon:     'fas fa-undo',
                            disabled: busy,
                            onclick:  function () { self._restoreTicket(); },
                        }, tr('ticket.restore', 'Restore ticket')));
                    }

                    if (canDelete) {
                        items.push(m(Button, {
                            icon:      'fas fa-times',
                            className: 'LinkRobinsSupport-reply-action--danger',
                            disabled:  busy,
                            onclick:   function () { self._forceDeleteTicket(); },
                        }, tr('action.delete_forever', 'Delete forever')));
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
                        accessibleToggleLabel: tr('ticket.mod_actions', 'Ticket moderation actions'),
                    }, items)
                );
            }

            _softDeleteTicket() {
                var self = this;
                try {
                    if (!window.confirm(tr('confirm.soft_delete_ticket', 'Soft-delete this ticket? It will be hidden from the index and from the ticket owner; staff can restore it.'))) return;
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
                    showError(isDeleted ? tr('errors.delete_ticket', 'Could not delete the ticket.') : tr('errors.restore_ticket', 'Could not restore the ticket.'));
                    m.redraw();
                });
            }

            _forceDeleteTicket() {
                var self = this;
                if (!self.ticket) return;
                try {
                    if (!window.confirm(tr('confirm.delete_ticket_forever', 'Permanently delete this ticket and all its replies? This cannot be undone.'))) return;
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
                    showError(tr('errors.delete_ticket_forever', 'Could not permanently delete the ticket.'));
                    m.redraw();
                });
            }

            _renderReplyForm() {
                var self = this;
                var canPostInternal = !!(self.ticket && self.ticket.attributes && self.ticket.attributes.canPostInternalNote);
                var canSubmit = !self.posting && self.replyText.trim() !== '';
                var canUpload = !!(app.forum && typeof app.forum.attribute === 'function' && app.forum.attribute('fof-upload.canUpload'));
                var placeholder = self.replyIsInternal
                    ? tr('reply.internal_placeholder', 'Internal note (only staff will see this)…')
                    : tr('reply.placeholder', 'Write a reply…');

                var TextEditor = getTextEditor();
                var editorNode;
                if (TextEditor) {
                    // Flarum's composer editor (Markdown toolbar + @mentions),
                    // matching the reply-edit box. It's uncontrolled, so after
                    // a post we clear by bumping `_replyEditorNonce` (the key),
                    // which remounts a fresh empty editor. The submit button is
                    // provided by TextEditor itself, so the actions row below
                    // only carries attach / internal-note.
                    if (!self._replyComposer) self._replyComposer = {};
                    // Wrap the keyed editor in an unkeyed div: it sits among
                    // unkeyed siblings (upload status, actions row) and mithril
                    // forbids mixing keyed/unkeyed siblings in one array. The
                    // key still lets us remount (clear) the editor after a post.
                    editorNode = m('div', { className: 'LinkRobinsSupport-editorWrap' }, m(TextEditor, {
                        key:         'lr-support-reply-' + (self._replyEditorNonce || 0),
                        composer:    self._replyComposer,
                        value:       self.replyText,
                        disabled:    self.posting,
                        placeholder: placeholder,
                        submitLabel: self.posting
                            ? tr('reply.posting', 'Posting…')
                            : tr('reply.post_reply', 'Post reply'),
                        onchange:    function (v) { self.replyText = v; },
                        onsubmit:    function () {
                            if (!self.posting && self.replyText.trim() !== '') {
                                self._postReply();
                            }
                        },
                    }));
                } else {
                    editorNode = m('textarea', {
                        className:   'FormControl LinkRobinsSupport-body',
                        rows:        5,
                        value:       self.replyText,
                        disabled:    self.posting,
                        placeholder: placeholder,
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
                    });
                }

                return m('div', { className: 'LinkRobinsSupport-replyForm' }, [
                    editorNode,

                    self.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' },
                        self.uploadError) : null,
                    self.uploadingCount > 0 ? m('div', { className: 'LinkRobinsSupport-uploadStatus' },
                        self.uploadingCount === 1
                            ? tr('common.uploading_one', 'Uploading 1 file…')
                            : tr('common.uploading_many', 'Uploading {count} files…', { count: self.uploadingCount })) : null,

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
                                ' ', tr('action.attach_files', 'Attach files'),
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
                            ' ', tr('reply.internal_note', 'Internal note'),
                        ]) : null,
                        // We always render our own submit button -- the embedded
                        // editor's built-in one is hidden (it carries header-
                        // control styling that breaks inline). Ctrl+Enter still
                        // submits via the editor's onsubmit.
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  !canSubmit,
                            onclick:   function () { self._postReply(); },
                        }, self.posting ? tr('reply.posting', 'Posting…') : tr('reply.post_reply', 'Post reply')),
                    ]),
                ]);
            }

            _uploadFiles(files) {
                var self = this;
                return uploadFilesToBody(this, files, 'replyText', function () {
                    return self._replyComposer && self._replyComposer.editor;
                });
            }

            _refreshTicket() {
                var self = this;
                fetchTicket(self._ticketId).then(function (result) {
                    self.ticket   = result.data;
                    self.included = result.included || [];
                    m.redraw();
                }).catch(function () {});
            }

            _postReply() {
                var self = this;
                self.posting = true;
                m.redraw();
                postReply(self.ticket.id, self.replyText, self.replyIsInternal)
                    .then(function (resp) {
                        self.replyText       = '';
                        self.replyIsInternal = false;
                        self.uploadError     = null;
                        self.uploadingCount  = 0;
                        self.posting         = false;
                        // Remount the (uncontrolled) core editor so it clears.
                        // Bumping the key tears down the old driver and builds a
                        // fresh empty one; a new holder avoids touching the
                        // destroyed driver in the gap before it rebuilds.
                        self._replyEditorNonce = (self._replyEditorNonce || 0) + 1;
                        self._replyComposer    = {};
                        // Append the new reply in place rather than a full
                        // two-request reload of the whole thread. Then refresh
                        // just the ticket so any server-side status/assignment
                        // change is still reflected (one request, no spinner).
                        if (resp && resp.data) {
                            self.replies = (self.replies || []).concat([resp.data]);
                            if (resp.included && resp.included.length) {
                                self.repliesIncluded = (self.repliesIncluded || []).concat(resp.included);
                            }
                        }
                        m.redraw();
                        self._refreshTicket();
                    })
                    .catch(function (err) {
                        self.posting = false;
                        console.error('[linkrobins/support] reply failed:', err);
                        showError(tr('errors.post_reply', 'Could not post reply.'));
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
