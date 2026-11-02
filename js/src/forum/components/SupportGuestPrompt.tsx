import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';

/**
 * What a logged-out visitor sees on any support page, in place of a list or a
 * ticket they cannot load. The pages ask the API for nothing as a guest, so no
 * request 403s and no error alert appears.
 */
export default class SupportGuestPrompt extends Component<{ message?: string }> {
  view() {
    const canSignUp = !!(app.forum && app.forum.attribute('allowSignUp'));

    return (
      <div className="LinkRobinsSupport-empty LinkRobinsSupport-guest">
        <p className="LinkRobinsSupport-guestText">{this.attrs.message || app.translator.trans('linkrobins-support.forum.guest.message')}</p>
        <div className="LinkRobinsSupport-guestActions">
          <Button className="Button Button--primary" onclick={() => app.modal.show(() => import('flarum/forum/components/LogInModal'))}>
            {app.translator.trans('linkrobins-support.forum.guest.log_in')}
          </Button>
          {canSignUp && (
            <Button className="Button" onclick={() => app.modal.show(() => import('flarum/forum/components/SignUpModal'))}>
              {app.translator.trans('linkrobins-support.forum.guest.sign_up')}
            </Button>
          )}
        </div>
      </div>
    );
  }
}
