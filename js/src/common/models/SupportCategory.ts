import Model from 'flarum/common/Model';
import type User from 'flarum/common/models/User';

/**
 * A support category (e.g. "Billing", "Appeals"). `isAppeal` categories are
 * the only ones a suspended/banned user may file under.
 */
export default class SupportCategory extends Model {
  name = Model.attribute<string>('name');
  slug = Model.attribute<string>('slug');
  description = Model.attribute<string | null>('description');
  color = Model.attribute<string | null>('color');
  icon = Model.attribute<string | null>('icon');
  position = Model.attribute<number>('position');
  isAppeal = Model.attribute<boolean>('isAppeal');
  ticketCount = Model.attribute<number>('ticketCount');

  // The staff member new tickets here are assigned to, and the only person
  // notified about them. Null means no auto-assign: all staff are notified.
  // Serialized to staff only, so it reads as null for everyone else.
  defaultAssignee = Model.hasOne<User>('defaultAssignee');

  createdAt = Model.attribute('createdAt', Model.transformDate);
  updatedAt = Model.attribute('updatedAt', Model.transformDate);
}
