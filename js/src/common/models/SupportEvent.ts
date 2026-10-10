import Model from 'flarum/common/Model';
import type User from 'flarum/common/models/User';

/**
 * A status or assignment change on a ticket, shown inline in its timeline.
 * `user` made the change; it is null when the forum did it (auto-close) or
 * the account has been deleted.
 */
export default class SupportEvent extends Model {
  type = Model.attribute<string>('type');
  fromStatus = Model.attribute<string | null>('fromStatus');
  toStatus = Model.attribute<string | null>('toStatus');
  hadAssignee = Model.attribute<boolean>('hadAssignee');
  hasAssignee = Model.attribute<boolean>('hasAssignee');
  isAutomatic = Model.attribute<boolean>('isAutomatic');
  createdAt = Model.attribute('createdAt', Model.transformDate);

  user = Model.hasOne<User | null>('user');
  fromUser = Model.hasOne<User | null>('fromUser');
  toUser = Model.hasOne<User | null>('toUser');
}
