import app from 'flarum/forum/app';
import ComposerBody, { type IComposerBodyAttrs } from 'flarum/forum/components/ComposerBody';
import extractText from 'flarum/common/utils/extractText';
import type Mithril from 'mithril';

export interface ISupportComposerHeaderItem {
  name?: string;
  content: Mithril.Children;
  priority?: number;
}

export interface ISupportComposerAttrs extends IComposerBodyAttrs {
  className?: string;
  supportContext?: string;
  canPostInternal?: boolean;
  onSupportSubmit?: (content: string, body: SupportComposer) => void;
  supportHeaderItems?: (body: SupportComposer) => (ISupportComposerHeaderItem | null | undefined)[];
}

/**
 * Custom ComposerBody component for LinkRobins Support tickets and replies.
 * Subclasses Flarum's native ComposerBody and runs within the docked composer.
 */
export default class SupportComposer<CustomAttrs extends ISupportComposerAttrs = ISupportComposerAttrs> extends ComposerBody<CustomAttrs> {
  static focusOnSelector = () => '.TextEditor-editor';

  isInternal = false;
  private _lastSupportContext?: string;

  static initAttrs(attrs: ISupportComposerAttrs) {
    super.initAttrs(attrs);
    attrs.className = attrs.className || 'LinkRobinsSupport-composer';
  }

  oninit(vnode: any) {
    super.oninit(vnode);
    this.isInternal = false;
    this._lastSupportContext = vnode.attrs.supportContext;
    this._syncComposerRef();
  }

  onbeforeupdate(vnode: any) {
    const result = super.onbeforeupdate(vnode);
    if (vnode.attrs.supportContext !== this._lastSupportContext || !vnode.attrs.canPostInternal) {
      this.isInternal = false;
      this._lastSupportContext = vnode.attrs.supportContext;
    }
    this._syncComposerRef();
    return result;
  }

  onupdate(vnode: any) {
    super.onupdate(vnode);
    const placeholder =
      this.attrs.canPostInternal && this.isInternal
        ? extractText(app.translator.trans('linkrobins-support.forum.reply.internal_placeholder'))
        : this.attrs.placeholder;
    this.$('.TextEditor-editor').attr('placeholder', placeholder || '');
  }

  onremove(vnode: any) {
    super.onremove(vnode);
    if (this.composer && (this.composer as any)._supportComposer === this) {
      (this.composer as any)._supportComposer = null;
    }
  }

  private _syncComposerRef() {
    if (!this.composer) return;
    if (this.attrs.canPostInternal) {
      (this.composer as any)._supportComposer = this;
    } else if ((this.composer as any)._supportComposer === this) {
      (this.composer as any)._supportComposer = null;
    }
  }

  headerItems() {
    const items = super.headerItems();
    const defs = typeof this.attrs.supportHeaderItems === 'function' ? this.attrs.supportHeaderItems(this) : null;
    if (defs && defs.length) {
      defs.forEach((d, i) => {
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
}
