import Model from 'flarum/common/Model';
import type User from 'flarum/common/models/User';
import type SupportCategory from './SupportCategory';

/**
 * A support ticket. The `can*` booleans are server-computed per-actor gates
 * that the UI uses to decide which moderation controls to show.
 */
export default class SupportTicket extends Model {
  subject = Model.attribute<string>('subject');
  status = Model.attribute<string>('status');
  decision = Model.attribute<string | null>('decision');
  replyCount = Model.attribute<number>('replyCount');

  canReply = Model.attribute<boolean>('canReply');
  canUpdate = Model.attribute<boolean>('canUpdate');
  canPostInternalNote = Model.attribute<boolean>('canPostInternalNote');
  canDelete = Model.attribute<boolean>('canDelete');
  canReopen = Model.attribute<boolean>('canReopen');
  isDeleted = Model.attribute<boolean>('isDeleted');

  createdAt = Model.attribute('createdAt', Model.transformDate);
  updatedAt = Model.attribute('updatedAt', Model.transformDate);
  lastReplyAt = Model.attribute('lastReplyAt', Model.transformDate);
  deletedAt = Model.attribute('deletedAt', Model.transformDate);

  user = Model.hasOne<User>('user');
  assignedStaff = Model.hasOne<User>('assignedStaff');
  category = Model.hasOne<SupportCategory>('category');
}
