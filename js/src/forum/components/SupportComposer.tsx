import ComposerBody, { type IComposerBodyAttrs } from 'flarum/forum/components/ComposerBody';
import type Mithril from 'mithril';

export interface ISupportComposerHeaderItem {
  name?: string;
  content: Mithril.Children;
  priority?: number;
}

export interface ISupportComposerAttrs extends IComposerBodyAttrs {
  className?: string;
  supportContext?: string;
  onSupportSubmit?: (content: string, body: SupportComposer) => void;
  supportHeaderItems?: (body: SupportComposer) => (ISupportComposerHeaderItem | null | undefined)[];
}

/**
 * Custom ComposerBody component for LinkRobins Support tickets and replies.
 * Subclasses Flarum's native ComposerBody and runs within the docked composer.
 */
export default class SupportComposer<CustomAttrs extends ISupportComposerAttrs = ISupportComposerAttrs> extends ComposerBody<CustomAttrs> {
  static focusOnSelector = () => '.TextEditor-editor';

  static initAttrs(attrs: ISupportComposerAttrs) {
    super.initAttrs(attrs);
    attrs.className = attrs.className || 'LinkRobinsSupport-composer';
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
