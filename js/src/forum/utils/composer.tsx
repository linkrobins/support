import app from 'flarum/forum/app';
import Avatar from 'flarum/common/components/Avatar';
import username from 'flarum/common/helpers/username';
import ComposerPostPreview from 'flarum/forum/components/ComposerPostPreview';
import { showError } from './helpers';

/**
 * Whether the real docked composer can be used. True when app.composer exists
 * and its load() method is available.
 */
export function supportComposerSupported(): boolean {
  return !!(app.composer && typeof app.composer.load === 'function');
}

/**
 * Open the docked composer with a SupportComposer body.
 * Loads core's ComposerBody chunk if needed, then loads SupportComposer.
 */
export function openSupportComposer(attrs: any = {}): Promise<boolean> {
  if (!supportComposerSupported()) return Promise.resolve(false);
  if (!attrs.user) attrs.user = app.session && app.session.user;

  return import('flarum/forum/components/ComposerBody')
    .then(() => {
      return app.composer.load(() => import('../components/SupportComposer'), attrs);
    })
    .then(() => {
      app.composer.show();
      return true;
    })
    .catch((e) => {
      console.error('[linkrobins/support] could not load composer:', e);
      showError(app.translator.trans('linkrobins-support.forum.errors.unknown'));
      return false;
    });
}

/**
 * True when the docked composer is currently open with our body for the given
 * marker (set via attrs.supportContext).
 */
export function supportComposerOpenFor(contextKey: string): boolean {
  try {
    if (!app.composer || !app.composer.isVisible || !app.composer.isVisible()) return false;
    const body = app.composer.body;
    const bodyAttrs = body && body.attrs;
    return !!(bodyAttrs && bodyAttrs.supportContext === contextKey);
  } catch (e) {
    return false;
  }
}

/**
 * Render the same "reply placeholder" Flarum shows at the end of a discussion:
 * a click-to-compose box, or -- while the composer is open for this context --
 * a live preview of what's being typed (ComposerPostPreview).
 */
export function supportComposerPreview(opts: { composing?: boolean; placeholder: any; onclick: () => void }): any {
  const user = app.session && app.session.user;

  if (opts.composing) {
    return (
      <article className="Post CommentPost editing" aria-busy="true">
        <div className="Post-container">
          <div className="Post-side">{user ? <Avatar user={user} className="Post-avatar" /> : null}</div>
          <div className="Post-main">
            <header className="Post-header">
              <div className="PostUser">
                <h3 className="PostUser-name">{username(user)}</h3>
              </div>
            </header>
            <div className="Post-body">
              <ComposerPostPreview className="Post-body" composer={app.composer} />
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <button type="button" className="Post ReplyPlaceholder" onclick={opts.onclick}>
      <div className="Post-container">
        <div className="Post-side">{user ? <Avatar user={user} className="Post-avatar" /> : null}</div>
        <div className="Post-main">
          <span className="Post-header">{opts.placeholder}</span>
        </div>
      </div>
    </button>
  );
}
