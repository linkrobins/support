import Model from 'flarum/common/Model';

/** A saved reply: a common answer staff insert into a ticket reply. */
export default class SupportSavedReply extends Model {
  title = Model.attribute<string>('title');
  content = Model.attribute<string>('content');
  position = Model.attribute<number | null>('position');
}
