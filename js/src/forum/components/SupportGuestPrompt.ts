import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import { tr, trText } from '../utils/translate';

/**
 * What a logged-out visitor sees on any support page, in place of a list or a
 * ticket they cannot load. The pages ask the API for nothing as a guest, so no
 * request 403s and no error alert appears.
 */
export default class SupportGuestPrompt extends Component<{ message?: string }> {
  view() {
    const canSignUp = !!(app.forum && app.forum.attribute('allowSignUp'));
    return m('div', { className: 'LinkRobinsSupport-empty LinkRobinsSupport-guest' }, [
      m('p', { className: 'LinkRobinsSupport-guestText' }, this.attrs.message || tr('guest.message', 'Sign in to see your tickets.')),
      m('div', { className: 'LinkRobinsSupport-guestActions' }, [
        m(
          Button,
          { className: 'Button Button--primary', onclick: () => app.modal.show(() => import('flarum/forum/components/LogInModal')) },
          trText('guest.log_in', 'Log In')
        ),
        canSignUp
          ? m(
              Button,
              { className: 'Button', onclick: () => app.modal.show(() => import('flarum/forum/components/SignUpModal')) },
              trText('guest.sign_up', 'Sign Up')
            )
          : null,
      ]),
    ]);
  }
}
