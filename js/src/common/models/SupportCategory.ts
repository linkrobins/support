import Model from 'flarum/common/Model';

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

  createdAt = Model.attribute('createdAt', Model.transformDate);
  updatedAt = Model.attribute('updatedAt', Model.transformDate);
}
