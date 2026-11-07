import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Avatar from 'flarum/common/components/Avatar';
import username from 'flarum/common/helpers/username';
import ComposerPostPreview from 'flarum/forum/components/ComposerPostPreview';
import SplitDropdown from 'flarum/common/components/SplitDropdown';
import Button from 'flarum/common/components/Button';
import extractText from 'flarum/common/utils/extractText';
import SavedRepliesMenu from '../components/SavedRepliesMenu';
import { showError } from './helpers';

let textEditorControlsInstalled = false;

export function installComposerControls(): void {
  if (textEditorControlsInstalled) return;
  textEditorControlsInstalled = true;

  extend('flarum/common/components/TextEditor' as any, 'controlItems', function (items: any) {
    const composer = this.attrs.composer || app.composer;
    const bodyInstance = composer && composer._supportComposerBody;
    const bodyState = composer && composer.body;
    const bodyAttrs = (bodyInstance && bodyInstance.attrs) || (bodyState && bodyState.attrs);
    if (!bodyAttrs || !bodyAttrs.canPostInternal) return;

    const isInternal = !!(
      (bodyInstance && bodyInstance._supportInternal) ||
      (bodyState && bodyState._supportInternal) ||
      (bodyAttrs && bodyAttrs._supportInternal)
    );
    const onsubmit = this.onsubmit.bind(this);
    const submitLabel = isInternal
      ? app.translator.trans('linkrobins-support.forum.reply.internal_note')
      : this.attrs.submitLabel || app.translator.trans('linkrobins-support.forum.reply.post_reply');

    const setInternal = (next: boolean) => {
      if (bodyInstance) bodyInstance._supportInternal = next;
      if (bodyState) bodyState._supportInternal = next;
      if (bodyAttrs) bodyAttrs._supportInternal = next;
      m.redraw();
    };

    const splitControl = (
      <SplitDropdown
        className="App-primaryControl LinkRobinsSupport-composerSplit"
        buttonClassName={'Button Button--primary' + (isInternal ? ' LinkRobinsSupport-btn--internal' : '')}
        menuClassName="Dropdown-menu--top Dropdown-menu--right"
        accessibleToggleLabel={extractText(app.translator.trans('linkrobins-support.forum.reply.internal_note'))}
        mainAction={
          <Button
            className={'Button Button--primary' + (isInternal ? ' LinkRobinsSupport-btn--internal' : '')}
            icon="fas fa-paper-plane"
            disabled={this.disabled}
            onclick={onsubmit}
          >
            {submitLabel}
          </Button>
        }
      >
        <Button
          key="mode-public"
          icon="fas fa-paper-plane"
          className={'Dropdown-item' + (!isInternal ? ' active' : '')}
          onclick={() => setInternal(false)}
        >
          {app.translator.trans('linkrobins-support.forum.reply.post_reply')}
        </Button>
        <Button
          key="mode-internal"
          icon="fas fa-lock"
          className={'Dropdown-item LinkRobinsSupport-item--internal' + (isInternal ? ' active' : '')}
          onclick={() => setInternal(true)}
        >
          {app.translator.trans('linkrobins-support.forum.reply.internal_note')}
        </Button>
      </SplitDropdown>
    );

    if (items.has('submit')) {
      items.setContent('submit', splitControl);
    } else {
      items.add('submit', splitControl, 0);
    }
  });

  extend('flarum/common/components/TextEditor' as any, 'toolbarItems', function (items: any) {
    const composer = this.attrs.composer || app.composer;
    const bodyInstance = composer && composer._supportComposerBody;
    const bodyState = composer && composer.body;
    const bodyAttrs = (bodyInstance && bodyInstance.attrs) || (bodyState && bodyState.attrs);
    if (!bodyAttrs || !bodyAttrs.canPostInternal) return;

    items.add('linkrobinsSavedReplies', <SavedRepliesMenu />, -10);
  });
}

// Resolved on first use. We drive Flarum's real docked composer (app.composer)
// instead of embedding TextEditor inline -- that's the environment FoF Rich
// Text, FoF Upload, Mentions and Emoji are built for, so they all behave
// exactly as in a normal forum reply. Null on stripped-down installs, where
// callers fall back to a plain-textarea editor.
let SupportComposerClass: any = null;

/**
 * Build a ComposerBody subclass for the docked composer. The caller drives
 * behaviour through attrs so one class serves replies, edits and new tickets:
 *   onSupportSubmit(content, body)  perform the save; call body.composer.hide()
 *                                   on success.
 *   supportHeaderItems(body)        optional [{name, content, priority}] rows
 *                                   rendered above the editor.
 */
function makeSupportComposer(ComposerBody: any): any {
  return class SupportComposer extends ComposerBody {
    oninit(vnode: any) {
      super.oninit(vnode);
      this._supportInternal = false;
      if (this.composer) {
        this.composer._supportComposerBody = this;
      }
    }

    onremove(vnode: any) {
      if (this.composer && this.composer._supportComposerBody === this) {
        this.composer._supportComposerBody = null;
      }
      if (super.onremove) {
        super.onremove(vnode);
      }
    }

    headerItems() {
      const items = super.headerItems();
      const defs = typeof this.attrs.supportHeaderItems === 'function' ? this.attrs.supportHeaderItems(this) : null;
      if (defs && defs.length) {
        defs.forEach((d: any, i: number) => {
          if (d == null) return;
          items.add(d.name || 'support-header-' + i, d.content, d.priority || 0);
        });
      }
      return items;
    }

    onsubmit() {
      const content = this.composer.fields.content();
      if (typeof this.attrs.onSupportSubmit === 'function') {
        this.attrs.onSupportSubmit(content, this);
      }
    }
  };
}

// Core ships ComposerBody in a lazily-loaded chunk (registered via
// flarum.reg.addChunkModule, not eagerly), so a static import would resolve to
// null at module-init. We therefore resolve it asynchronously: build the
// SupportComposer subclass the first time it's needed (loading the chunk if
// necessary) and cache it. A static `import ComposerBody from ...` would force
// webpack to eagerly require the chunk and break.
const COMPOSER_BODY_PATH = 'flarum/forum/components/ComposerBody';

function ensureSupportComposer(): Promise<any> {
  if (SupportComposerClass) return Promise.resolve(SupportComposerClass);
  try {
    const loaded = flarum.reg.checkModule && flarum.reg.checkModule('core', 'forum/components/ComposerBody');
    if (loaded) {
      const base = loaded.default || loaded;
      SupportComposerClass = makeSupportComposer(base);
      return Promise.resolve(SupportComposerClass);
    }
  } catch (e) {}
  try {
    if (flarum.reg.asyncModuleImport) {
      return flarum.reg
        .asyncModuleImport(COMPOSER_BODY_PATH)
        .then((mod: any) => {
          const base = (mod && mod.default) || mod || null;
          SupportComposerClass = base ? makeSupportComposer(base) : null;
          return SupportComposerClass;
        })
        .catch((e: any) => {
          console.error('[linkrobins/support] could not load composer chunk:', e);
          return null;
        });
    }
  } catch (e) {}
  return Promise.resolve(null);
}

/**
 * Whether the real docked composer can be used. True when app.composer exists
 * and core's ComposerBody is either loaded or registered in a chunk we can load
 * on demand.
 */
export function supportComposerSupported(): boolean {
  if (!app.composer || typeof app.composer.load !== 'function') return false;
  if (SupportComposerClass) return true;
  try {
    if (flarum.reg.checkModule && flarum.reg.checkModule('core', 'forum/components/ComposerBody')) return true;
    if (
      flarum.reg.chunkModules &&
      typeof flarum.reg.chunkModules.has === 'function' &&
      flarum.reg.chunkModules.has('core:forum/components/ComposerBody')
    )
      return true;
  } catch (e) {}
  return false;
}

/**
 * Open the docked composer with a SupportComposer body. Loads the composer
 * chunk first if needed. Returns true when the real composer is available;
 * false on stripped installs so callers can fall back to an inline editor.
 */
export function openSupportComposer(attrs: any): boolean {
  if (!supportComposerSupported()) return false;
  installComposerControls();
  if (!attrs.user) attrs.user = app.session && app.session.user;
  ensureSupportComposer().then((Cls: any) => {
    if (!Cls) {
      showError(app.translator.trans('linkrobins-support.forum.errors.unknown'));
      return;
    }
    app.composer.load(Cls, attrs).then(() => {
      app.composer.show();
    });
  });
  return true;
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

/** Live content of the open composer (empty string when not applicable). */
export function supportComposerContent(): string {
  try {
    if (app.composer && app.composer.fields && app.composer.fields.content) {
      return app.composer.fields.content() || '';
    }
  } catch (e) {}
  return '';
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
