import Component from 'flarum/common/Component';
import { tr } from '../utils/translate';
import { supportComposerSupported, supportComposerOpenFor, supportComposerPreview } from '../utils/composer';

// Presentational reply composer. Preferred path is a click-to-open preview for
// Flarum's docked composer (rich text / upload / mentions); the fallback is a
// plain textarea + attach button for stripped installs without the composer.
// SupportShowPage owns all state (replyText, posting, upload state) and the
// submit/upload logic; this renders and emits callbacks.
export default class ReplyComposer extends Component {
  view() {
    const a = this.attrs as any;
    const ticket = a.ticket;
    const canPostInternal = !!(ticket && ticket.canPostInternalNote());

    // Preferred path: open Flarum's real docked composer.
    if (supportComposerSupported()) {
      const open = supportComposerOpenFor('reply:' + ticket.id());
      return m(
        'div',
        { className: 'LinkRobinsSupport-replyPrompt' },
        supportComposerPreview({
          composing: open,
          placeholder: app.translator.trans('core.forum.post_stream.reply_placeholder'),
          onclick: () => a.onOpenComposer(canPostInternal),
        })
      );
    }

    // Fallback for stripped installs: a plain textarea + attach button.
    const canSubmit = !a.posting && a.replyText.trim() !== '';
    const canUpload = !!(
      app.forum &&
      typeof app.forum.attribute === 'function' &&
      app.forum.attribute('fof-upload.canUpload')
    );
    const placeholder = a.replyIsInternal
      ? tr('reply.internal_placeholder', 'Internal note (only staff will see this)…')
      : tr('reply.placeholder', 'Write a reply…');

    return m('div', { className: 'LinkRobinsSupport-replyForm' }, [
      m('textarea', {
        className: 'FormControl LinkRobinsSupport-body',
        rows: 5,
        value: a.replyText,
        disabled: a.posting,
        placeholder,
        oninput: (e: any) => {
          a.onReplyTextInput(e.target.value);
        },
        onkeydown: (e: any) => {
          const isSubmit = (e.key === 'Enter' || e.keyCode === 13) && (e.ctrlKey || e.metaKey);
          if (!isSubmit) return;
          if (!a.posting && a.replyText.trim() !== '') {
            e.preventDefault();
            a.onSubmit();
          }
        },
      }),

      a.uploadError
        ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' }, a.uploadError)
        : null,
      a.uploadingCount > 0
        ? m(
            'div',
            { className: 'LinkRobinsSupport-uploadStatus' },
            a.uploadingCount === 1
              ? tr('common.uploading_one', 'Uploading 1 file…')
              : tr('common.uploading_many', 'Uploading {count} files…', { count: a.uploadingCount })
          )
        : null,

      m('div', { className: 'LinkRobinsSupport-replyForm-actions' }, [
        canUpload
          ? m('span', { className: 'LinkRobinsSupport-attachBtnWrap' }, [
              m(
                'button',
                {
                  type: 'button',
                  className: 'Button Button--default LinkRobinsSupport-attachBtn',
                  disabled: a.posting || a.uploadingCount > 0,
                  onclick: () => a.onAttachClick(),
                },
                [m('i', { className: 'fas fa-paperclip' }), ' ', tr('action.attach_files', 'Attach files')]
              ),
              m('input', {
                type: 'file',
                multiple: true,
                style: 'display:none;',
                disabled: a.posting || a.uploadingCount > 0,
                oncreate: (vnode: any) => {
                  a.onFileInputCreate(vnode.dom);
                },
                onremove: () => {
                  a.onFileInputRemove();
                },
                onchange: (e: any) => {
                  const files = e.target.files;
                  if (files && files.length) {
                    a.onFilesChosen(files);
                  }
                  try {
                    e.target.value = '';
                  } catch (err) {}
                },
              }),
            ])
          : null,
        canPostInternal
          ? m('label', { className: 'LinkRobinsSupport-internalToggle' }, [
              m('input', {
                type: 'checkbox',
                checked: a.replyIsInternal,
                disabled: a.posting,
                onchange: (e: any) => {
                  a.onToggleInternal(!!e.target.checked);
                },
              }),
              ' ',
              tr('reply.internal_note', 'Internal note'),
            ])
          : null,
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--primary',
            disabled: !canSubmit,
            onclick: () => a.onSubmit(),
          },
          a.posting ? tr('reply.posting', 'Posting…') : tr('reply.post_reply', 'Post reply')
        ),
      ]),
    ]);
  }
}
