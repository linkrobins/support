import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import { refreshCounts } from './counts';
import type SupportTicket from '../../common/models/SupportTicket';
import type SupportReply from '../../common/models/SupportReply';
import type SupportCategory from '../../common/models/SupportCategory';

function apiUrl(): string {
  return app.forum.attribute('apiUrl');
}

// --- Reads (cached + relationship-resolved via the store) ---------------

export function loadTickets(params?: Record<string, any>): Promise<any> {
  return app.store.find(
    'linkrobins-support-tickets',
    Object.assign(
      {
        sort: '-lastReplyAt',
        page: { limit: 25 },
        include: 'user,category,assignedStaff',
      },
      params || {}
    )
  );
}

export function loadTicket(id: string | number): Promise<SupportTicket> {
  return app.store.find('linkrobins-support-tickets', String(id), {
    include: 'user,category,assignedStaff',
  });
}

export function loadReplies(ticketId: string | number, offset = 0, limit = 50): Promise<any> {
  // Paginated (oldest-first): the show page loads one page and appends more on
  // demand, so long tickets don't fetch every reply + rendered HTML at once.
  // The endpoint enforces paginate(50, 200), so limit is capped server-side.
  return app.store.find('linkrobins-support-replies', {
    sort: 'createdAt',
    filter: { ticketId },
    page: { offset, limit },
    include: 'user,editedBy',
  });
}

export function loadEvents(ticketId: string | number): Promise<any> {
  // Status and assignment history for one ticket, oldest first. Bounded by
  // the endpoint's paginate(200, 200); a ticket with more changes than that
  // shows its first 200, which is far past what anyone scrolls through.
  return app.store.find('linkrobins-support-events', {
    sort: 'createdAt',
    filter: { ticketId },
    page: { limit: 200 },
    include: 'user,fromUser,toUser',
  });
}

export interface StaffMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * The support team, for the Assign picker. A dedicated staff-only endpoint:
 * core's user list needs searchUsers, which support staff often lack.
 */
export function loadStaff(): Promise<StaffMember[]> {
  return app.request({ method: 'GET', url: apiUrl() + '/linkrobins-support-staff' }).then((res: any) => (res && res.data) || []);
}

/**
 * Record that the current user has just looked at a ticket, so it stops
 * showing as unread for them. Fire and forget: a failure only means the
 * marker stays until their next visit.
 */
export function markTicketRead(ticket: any): void {
  if (!ticket || !app.session.user) return;
  app
    .request({ method: 'POST', url: apiUrl() + '/linkrobins-support-tickets/' + ticket.id() + '/read' })
    .then(() => {
      if (typeof ticket.pushAttributes === 'function') ticket.pushAttributes({ isUnread: false });
      refreshCounts();
    })
    .catch(() => {});
}

export function loadCategories(): Promise<any> {
  return app.store.find('linkrobins-support-categories', {
    sort: 'position',
    page: { limit: 100 },
  });
}

// --- Writes (store records: cached, reactive, relationship-aware) --------

export function createTicket(subjectOrData: string | Record<string, any>, category?: SupportCategory, body?: string): Promise<SupportTicket> {
  // Single atomic create: the opening message rides along as `firstPost` and
  // the backend posts it as the first reply in the same transaction. This used
  // to be two requests (save ticket, then postReply); if the second failed it
  // left a subject-only ticket the owner couldn't fix.
  const payload =
    typeof subjectOrData === 'object' && subjectOrData !== null
      ? subjectOrData
      : { subject: subjectOrData, firstPost: body, relationships: { category } };

  return app.store.createRecord<SupportTicket>('linkrobins-support-tickets').save(payload);
}

export function postReply(ticket: SupportTicket, content: string, isInternal: boolean): Promise<SupportReply> {
  return app.store
    .createRecord<SupportReply>('linkrobins-support-replies')
    .save({ content, isInternalNote: !!isInternal, relationships: { ticket } });
}

// --- File upload --------------------------------------------------------
//
// fof/upload is a bespoke multipart endpoint, not a JSON:API resource the
// store models, so it stays a raw request. Used only by the plain-textarea
// fallback editors -- the real docked composer ships FoF Upload's own button.
//
// When the caller is backed by Flarum's TextEditor (which owns its own
// textarea), pass `editorGetter` so we insert into the live editor (whose
// oninput syncs target[bodyKey] back for us); plain-textarea callers omit it.
export function uploadFilesToBody(target: any, files: FileList | File[], bodyKey: string, editorGetter?: () => any): Promise<void> {
  target.uploadError = null;
  target.uploadingCount = (target.uploadingCount || 0) + files.length;
  m.redraw();

  const form = new FormData();
  for (let i = 0; i < files.length; i++) {
    form.append('files[]', files[i]);
  }

  return app
    .request({
      method: 'POST',
      url: apiUrl() + '/fof/upload',
      body: form,
      serialize: (raw: any) => raw,
    })
    .then((resp: any) => {
      target.uploadingCount = Math.max(0, target.uploadingCount - files.length);
      const data = (resp && resp.data) || [];
      let inserted = '';
      data.forEach((file: any) => {
        const attrs = (file && file.attributes) || {};
        let bb = attrs.bbcode;
        if (!bb && attrs.uuid) {
          const name = attrs.base_name || attrs.uuid;
          const size = attrs.size != null ? String(attrs.size) : '0';
          bb = '[upl-file uuid="' + attrs.uuid + '" size="' + size + '"]' + name + '[/upl-file]';
        }
        if (bb) inserted += (inserted ? '\n' : '') + bb;
      });
      if (inserted) {
        const editor = typeof editorGetter === 'function' ? editorGetter() : null;
        if (editor && typeof editor.insertAt === 'function' && editor.el) {
          const curVal = editor.el.value || '';
          const lead = curVal && !curVal.endsWith('\n') ? '\n' : '';
          editor.insertAt(curVal.length, lead + inserted + '\n');
        } else {
          const existing = target[bodyKey] || '';
          const sep = existing && !existing.endsWith('\n') ? '\n' : '';
          target[bodyKey] = existing + sep + inserted + '\n';
        }
      } else {
        target.uploadError = extractText(app.translator.trans('linkrobins-support.forum.errors.upload_no_files'));
      }
      m.redraw();
    })
    .catch((err: any) => {
      target.uploadingCount = Math.max(0, target.uploadingCount - files.length);
      let msg = extractText(app.translator.trans('linkrobins-support.forum.errors.upload'));
      try {
        const resp = err && err.response;
        if (resp && resp.errors && resp.errors[0]) {
          msg = resp.errors[0].detail || resp.errors[0].title || msg;
        }
      } catch (e) {}
      target.uploadError = msg;
      console.error('[linkrobins/support] upload failed:', err);
      m.redraw();
    });
}
