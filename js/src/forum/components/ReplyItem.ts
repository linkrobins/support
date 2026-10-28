import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Dropdown from 'flarum/common/components/Dropdown';
import ItemList from 'flarum/common/utils/ItemList';
import extractText from 'flarum/common/utils/extractText';
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
                title: extractText(
                  editedBy
                    ? app.translator.trans('linkrobins-support.forum.reply.edited_by', {
                        date: formatDate(editedAt),
                        name: editedBy.displayName() || editedBy.username(),
                      })
                    : app.translator.trans('linkrobins-support.forum.reply.edited_at', { date: formatDate(editedAt) })
                ),
              },
              app.translator.trans('linkrobins-support.forum.reply.edited_marker')
            )
          : null,
        isDeleted
          ? m('span', { className: 'LinkRobinsSupport-reply-deletedBadge' }, [
              m('i', { className: 'fas fa-trash' }),
              ' ',
              app.translator.trans('linkrobins-support.forum.show.deleted_badge'),
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
              app.translator.trans('linkrobins-support.forum.reply.deleted_notice')
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
    if (editing) {
      return null;
    }

    const items = this.actionItems(reply, isDeleted, busy);

    if (items.isEmpty()) return null;

    return m(
      'span',
      { className: 'LinkRobinsSupport-reply-actions' },
      m(
        Dropdown,
        {
          menuClassName: 'Dropdown-menu--right',
          buttonClassName: 'Button Button--icon Button--flat LinkRobinsSupport-reply-actionsToggle',
          icon: 'fas fa-ellipsis-h',
          accessibleToggleLabel: extractText(app.translator.trans('linkrobins-support.forum.reply.mod_actions')),
        },
        items.toArray()
      )
    );
  }

  /**
   * A reply's menu, as an ItemList so other extensions can add to it: edit
   * (100), delete and restore (-10), delete forever (-100), in the order
   * core's PostControls uses.
   */
  actionItems(reply: any, isDeleted: boolean, busy: boolean) {
    const { onBeginEdit, onSoftDelete, onRestore, onForceDelete } = this.attrs as any;
    const canEdit = !!reply.canEdit();
    const canDelete = !!reply.canDelete();
    const items = new ItemList();

    if (!isDeleted) {
      if (canEdit) {
        items.add(
          'edit',
          m(
            Button,
            { icon: 'fas fa-pencil-alt', disabled: busy, onclick: () => onBeginEdit(reply) },
            app.translator.trans('linkrobins-support.forum.action.edit')
          ),
          100
        );
      }
      if (canDelete) {
        items.add(
          'delete',
          m(
            Button,
            {
              icon: 'fas fa-trash',
              className: 'LinkRobinsSupport-reply-action--danger',
              disabled: busy,
              onclick: () => onSoftDelete(reply),
            },
            app.translator.trans('linkrobins-support.forum.action.delete')
          ),
          -10
        );
      }
    } else if (canDelete) {
      items.add(
        'restore',
        m(
          Button,
          { icon: 'fas fa-undo', disabled: busy, onclick: () => onRestore(reply) },
          app.translator.trans('linkrobins-support.forum.action.restore')
        ),
        -10
      );
      items.add(
        'forceDelete',
        m(
          Button,
          {
            icon: 'fas fa-times',
            className: 'LinkRobinsSupport-reply-action--danger',
            disabled: busy,
            onclick: () => onForceDelete(reply),
          },
          app.translator.trans('linkrobins-support.forum.action.delete_forever')
        ),
        -100
      );
    }

    return items;
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
          app.translator.trans('linkrobins-support.forum.action.cancel')
        ),
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--primary',
            disabled: !canSave,
            onclick: () => onSaveEditInline(reply),
          },
          state.busy
            ? app.translator.trans('linkrobins-support.forum.action.saving')
            : app.translator.trans('linkrobins-support.forum.action.save_changes')
        ),
      ]),
    ]);
  }
}
