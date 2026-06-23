import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Dropdown from 'flarum/common/components/Dropdown';
import { tr, trText } from '../utils/translate';
import { formatDate, userLink } from '../utils/helpers';

// Presentational single-reply renderer: header (author/date/edited/deleted +
// moderation dropdown), body, and the inline fallback editor. SupportShowPage
// owns the reply list and edit state; this receives one reply, its edit state,
// and callbacks. The inline editor mutates the passed editState object in place
// (the same object the parent holds), preserving the original behaviour.
export default class ReplyItem extends Component {
  view() {
    const { reply, editState } = this.attrs as any;
    const user = reply.user && reply.user();
    const html = reply.contentHtml() || '';
    const isInternal = !!reply.isInternalNote();
    const isDeleted = !!reply.isDeleted();
    const canEdit = !!reply.canEdit();
    const canDelete = !!reply.canDelete();
    const editedAt = reply.editedAt();
    const editedBy = reply.editedBy && reply.editedBy();

    const state = editState || null;
    const editing = !!(state && state.editing);
    const busy = !!(state && state.busy);

    let classes = 'LinkRobinsSupport-reply';
    if (isInternal) classes += ' is-internal';
    if (isDeleted) classes += ' is-deleted';

    return m('article', { className: classes }, [
      m('header', { className: 'LinkRobinsSupport-reply-header' }, [
        user ? m('span', { className: 'LinkRobinsSupport-reply-author' }, userLink(user)) : null,
        m('span', { className: 'LinkRobinsSupport-reply-date' }, formatDate(reply.createdAt())),
        editedAt
          ? m(
              'span',
              {
                className: 'LinkRobinsSupport-reply-edited',
                title: editedBy
                  ? trText('reply.edited_by', 'Edited by {name} on {date}', {
                      date: formatDate(editedAt),
                      name: editedBy.displayName() || editedBy.username(),
                    })
                  : trText('reply.edited_at', 'Edited on {date}', { date: formatDate(editedAt) }),
              },
              tr('reply.edited_marker', '(edited)')
            )
          : null,
        isDeleted
          ? m('span', { className: 'LinkRobinsSupport-reply-deletedBadge' }, [
              m('i', { className: 'fas fa-trash' }),
              ' ',
              tr('show.deleted_badge', 'Deleted'),
            ])
          : null,
        canEdit || canDelete ? this.actions(reply, isDeleted, editing, busy) : null,
      ]),

      editing
        ? this.editor(reply, state)
        : isDeleted
        ? m(
            'div',
            { className: 'LinkRobinsSupport-reply-body LinkRobinsSupport-reply-body--deleted' },
            tr('reply.deleted_notice', 'This reply was deleted.')
          )
        : m('div', {
            className: 'LinkRobinsSupport-reply-body',
            oncreate: (vnode: any) => {
              try {
                vnode.dom.innerHTML = html;
              } catch (e) {}
            },
            onupdate: (vnode: any) => {
              try {
                vnode.dom.innerHTML = html;
              } catch (e) {}
            },
          }),
    ]);
  }

  actions(reply: any, isDeleted: boolean, editing: boolean, busy: boolean) {
    const { onBeginEdit, onSoftDelete, onRestore, onForceDelete } = this.attrs as any;
    const canEdit = !!reply.canEdit();
    const canDelete = !!reply.canDelete();

    if (editing) {
      return null;
    }

    const items: any[] = [];
    if (!isDeleted) {
      if (canEdit) {
        items.push(
          m(Button, { icon: 'fas fa-pencil-alt', disabled: busy, onclick: () => onBeginEdit(reply) }, tr('action.edit', 'Edit'))
        );
      }
      if (canDelete) {
        items.push(
          m(
            Button,
            {
              icon: 'fas fa-trash',
              className: 'LinkRobinsSupport-reply-action--danger',
              disabled: busy,
              onclick: () => onSoftDelete(reply),
            },
            tr('action.delete', 'Delete')
          )
        );
      }
    } else {
      if (canDelete) {
        items.push(
          m(Button, { icon: 'fas fa-undo', disabled: busy, onclick: () => onRestore(reply) }, tr('action.restore', 'Restore'))
        );
        items.push(
          m(
            Button,
            {
              icon: 'fas fa-times',
              className: 'LinkRobinsSupport-reply-action--danger',
              disabled: busy,
              onclick: () => onForceDelete(reply),
            },
            tr('action.delete_forever', 'Delete forever')
          )
        );
      }
    }

    if (items.length === 0) return null;

    return m(
      'span',
      { className: 'LinkRobinsSupport-reply-actions' },
      m(
        Dropdown,
        {
          menuClassName: 'Dropdown-menu--right',
          buttonClassName: 'Button Button--icon Button--flat LinkRobinsSupport-reply-actionsToggle',
          icon: 'fas fa-ellipsis-h',
          accessibleToggleLabel: tr('reply.mod_actions', 'Moderation actions'),
        },
        items
      )
    );
  }

  // Inline edit-reply editor. Only a fallback on stripped installs without the
  // docked composer; normally onBeginEdit opens the composer instead.
  editor(reply: any, state: any) {
    const { onSaveEditInline, onCancelEdit } = this.attrs as any;
    const canSave = !state.busy && state.draft.trim() !== '';

    return m('div', { className: 'LinkRobinsSupport-reply-editor' }, [
      m('textarea', {
        className: 'FormControl LinkRobinsSupport-body',
        rows: 5,
        value: state.draft,
        disabled: state.busy,
        oninput: (e: any) => {
          state.draft = e.target.value;
        },
        onkeydown: (e: any) => {
          const isSubmit = (e.key === 'Enter' || e.keyCode === 13) && (e.ctrlKey || e.metaKey);
          if (!isSubmit) return;
          if (!state.busy && state.draft.trim() !== '') {
            e.preventDefault();
            onSaveEditInline(reply);
          }
        },
      }),
      m('div', { className: 'LinkRobinsSupport-reply-editor-actions' }, [
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--default',
            disabled: state.busy,
            onclick: () => onCancelEdit(reply),
          },
          tr('action.cancel', 'Cancel')
        ),
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--primary',
            disabled: !canSave,
            onclick: () => onSaveEditInline(reply),
          },
          state.busy ? tr('action.saving', 'Saving…') : tr('action.save_changes', 'Save changes')
        ),
      ]),
    ]);
  }
}
