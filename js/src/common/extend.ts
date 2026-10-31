import Extend from 'flarum/common/extenders';
import SupportCategory from './models/SupportCategory';
import SupportTicket from './models/SupportTicket';
import SupportReply from './models/SupportReply';
import SupportEvent from './models/SupportEvent';
import SupportSavedReply from './models/SupportSavedReply';

export default [
  new Extend.Store()
    .add('linkrobins-support-categories', SupportCategory)
    .add('linkrobins-support-tickets', SupportTicket)
    .add('linkrobins-support-replies', SupportReply)
    .add('linkrobins-support-events', SupportEvent)
    .add('linkrobins-support-saved-replies', SupportSavedReply),
];
