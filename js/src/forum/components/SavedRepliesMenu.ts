import Component from 'flarum/common/Component';
import Dropdown from 'flarum/common/components/Dropdown';
import Button from 'flarum/common/components/Button';
import { tr, trText } from '../utils/translate';

// Loaded once per page visit and shared by every composer that opens.
let cache: any[] | null = null;
let loading: Promise<any> | null = null;

function load(): Promise<any> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = app.store
      .find('linkrobins-support-saved-replies', { page: { limit: 200 } })
      .then((replies: any) => {
        cache = replies || [];
        m.redraw();
        return cache;
      })
      .catch(() => {
        cache = [];
        return cache;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/**
 * "Saved replies" in the reply composer header, for staff. Picking one
 * inserts its text at the cursor, so it can be edited before sending.
 * Hidden entirely when the forum has none saved.
 */
export default class SavedRepliesMenu extends Component {
  oninit(vnode: any) {
    super.oninit(vnode);
    load();
  }

  view() {
    if (!cache || cache.length === 0) return null;

    return m(
      Dropdown,
      {
        className: 'LinkRobinsSupport-savedReplies',
        buttonClassName: 'Button Button--flat LinkRobinsSupport-savedRepliesToggle',
        icon: 'fas fa-comment-dots',
        label: tr('reply.saved_replies', 'Saved replies'),
        accessibleToggleLabel: trText('reply.saved_replies', 'Saved replies'),
      },
      cache.map((reply: any) =>
        m(
          Button,
          {
            onclick: () => {
              const editor = app.composer && (app.composer as any).editor;
              if (editor && typeof editor.insertAtCursor === 'function') {
                editor.insertAtCursor(reply.content());
              }
            },
          },
          reply.title()
        )
      )
    );
  }
}
