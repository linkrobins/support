import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import extractText from 'flarum/common/utils/extractText';
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
      return (
        <div className="LinkRobinsSupport-replyPrompt">
          {supportComposerPreview({
            composing: open,
            placeholder: app.translator.trans('core.forum.post_stream.reply_placeholder'),
            onclick: () => a.onOpenComposer(canPostInternal),
          })}
        </div>
      );
    }

    // Fallback for stripped installs: a plain textarea + attach button.
    const canSubmit = !a.posting && a.replyText.trim() !== '';
    const canUpload = !!(app.forum && typeof app.forum.attribute === 'function' && app.forum.attribute('fof-upload.canUpload'));
    const placeholder = a.replyIsInternal
      ? extractText(app.translator.trans('linkrobins-support.forum.reply.internal_placeholder'))
      : extractText(app.translator.trans('linkrobins-support.forum.reply.placeholder'));

    return (
      <div className="LinkRobinsSupport-replyForm">
        <textarea
          className="FormControl LinkRobinsSupport-body"
          rows={5}
          value={a.replyText}
          disabled={a.posting}
          placeholder={placeholder}
          oninput={(e: any) => {
            a.onReplyTextInput(e.target.value);
          }}
          onkeydown={(e: any) => {
            const isSubmit = (e.key === 'Enter' || e.keyCode === 13) && (e.ctrlKey || e.metaKey);
            if (!isSubmit) return;
            if (!a.posting && a.replyText.trim() !== '') {
              e.preventDefault();
              a.onSubmit();
            }
          }}
        />

        {a.uploadError && <div className="Alert Alert--danger LinkRobinsSupport-uploadAlert">{a.uploadError}</div>}
        {a.uploadingCount > 0 && (
          <div className="LinkRobinsSupport-uploadStatus">
            {a.uploadingCount === 1
              ? app.translator.trans('linkrobins-support.forum.common.uploading_one')
              : app.translator.trans('linkrobins-support.forum.common.uploading_many', { count: a.uploadingCount })}
          </div>
        )}

        <div className="LinkRobinsSupport-replyForm-actions">
          {canUpload && (
            <span className="LinkRobinsSupport-attachBtnWrap">
              <Button
                className="Button Button--default LinkRobinsSupport-attachBtn"
                disabled={a.posting || a.uploadingCount > 0}
                onclick={() => a.onAttachClick()}
                icon="fas fa-paperclip"
              >
                {app.translator.trans('linkrobins-support.forum.action.attach_files')}
              </Button>
              <input
                type="file"
                multiple
                style={{ display: 'none' }}
                disabled={a.posting || a.uploadingCount > 0}
                oncreate={(vnode: any) => {
                  a.onFileInputCreate(vnode.dom);
                }}
                onremove={() => {
                  a.onFileInputRemove();
                }}
                onchange={(e: any) => {
                  const files = e.target.files;
                  if (files && files.length) {
                    a.onFilesChosen(files);
                  }
                  try {
                    e.target.value = '';
                  } catch (err) {}
                }}
              />
            </span>
          )}
          {canPostInternal && (
            <label className="LinkRobinsSupport-internalToggle">
              <input
                type="checkbox"
                checked={a.replyIsInternal}
                disabled={a.posting}
                onchange={(e: any) => {
                  a.onToggleInternal(!!e.target.checked);
                }}
              />{' '}
              {app.translator.trans('linkrobins-support.forum.reply.internal_note')}
            </label>
          )}
          <Button
            className="Button Button--primary"
            disabled={!canSubmit}
            loading={a.posting}
            onclick={() => a.onSubmit()}
          >
            {a.posting
              ? app.translator.trans('linkrobins-support.forum.reply.posting')
              : app.translator.trans('linkrobins-support.forum.reply.post_reply')}
          </Button>
        </div>
      </div>
    );
  }
}
