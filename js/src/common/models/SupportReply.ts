import Model from 'flarum/common/Model';
import type User from 'flarum/common/models/User';
import type SupportTicket from './SupportTicket';

/**
 * A reply on a support ticket. `content` is the raw markdown source (used to
 * pre-fill the editor); `contentHtml` is the rendered output. Internal notes
 * are only visible to staff.
 */
export default class SupportReply extends Model {
  content = Model.attribute<string>('content');
  contentHtml = Model.attribute<string>('contentHtml');
  isInternalNote = Model.attribute<boolean>('isInternalNote');

  canEdit = Model.attribute<boolean>('canEdit');
  canDelete = Model.attribute<boolean>('canDelete');
  isDeleted = Model.attribute<boolean>('isDeleted');

  createdAt = Model.attribute('createdAt', Model.transformDate);
  updatedAt = Model.attribute('updatedAt', Model.transformDate);
  editedAt = Model.attribute('editedAt', Model.transformDate);
  deletedAt = Model.attribute('deletedAt', Model.transformDate);

  user = Model.hasOne<User>('user');
  editedBy = Model.hasOne<User>('editedBy');
  ticket = Model.hasOne<SupportTicket>('ticket');
}
