import Extend from 'flarum/common/extenders';
import commonExtend from '../common/extend';
import { BASE_PATH } from './utils/helpers';
import {
  SUPPORT_TICKETS_RESOURCE,
  StatusGambit,
  AssignedGambit,
  MineGambit,
  PriorityGambit,
  CategoryGambit,
  TicketTypeGambit,
  AuthorGambit,
} from './query/ticketGambits';
import {
  NewSupportReplyNotification,
  NewSupportTicketNotification,
  TicketStatusChangedNotification,
  TicketAssignedNotification,
  AwaitingReminderNotification,
} from './components/notifications';

export default [
  ...commonExtend,

  new Extend.Search()
    .gambit(SUPPORT_TICKETS_RESOURCE, StatusGambit)
    .gambit(SUPPORT_TICKETS_RESOURCE, AssignedGambit)
    .gambit(SUPPORT_TICKETS_RESOURCE, MineGambit)
    .gambit(SUPPORT_TICKETS_RESOURCE, PriorityGambit)
    .gambit(SUPPORT_TICKETS_RESOURCE, CategoryGambit)
    .gambit(SUPPORT_TICKETS_RESOURCE, TicketTypeGambit)
    .gambit(SUPPORT_TICKETS_RESOURCE, AuthorGambit),

  new Extend.Routes()
    .add('linkrobins-support.index', BASE_PATH as any, () => import('./components/SupportIndexPage'))
    .add('linkrobins-support.search', (BASE_PATH + '/search') as any, () => import('./components/SupportSearchPage'))
    .add('linkrobins-support.compose', (BASE_PATH + '/new') as any, () => import('./components/SupportComposePage'))
    .add('linkrobins-support.filtered', (BASE_PATH + '/status/:status') as any, () => import('./components/SupportIndexPage'))
    .add('linkrobins-support.show', (BASE_PATH + '/:id') as any, () => import('./components/SupportShowPage')),

  new Extend.Notification()
    .add('linkrobinsSupportNewReply', NewSupportReplyNotification)
    .add('linkrobinsSupportNewTicket', NewSupportTicketNotification)
    .add('linkrobinsSupportTicketStatusChanged', TicketStatusChangedNotification)
    .add('linkrobinsSupportTicketAssigned', TicketAssignedNotification)
    .add('linkrobinsSupportAwaitingReminder', AwaitingReminderNotification),
];
