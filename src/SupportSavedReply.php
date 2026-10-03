<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;

/**
 * A saved reply: a common answer staff can drop into a ticket reply and
 * then edit before sending.
 *
 * @property int $id
 * @property string $title
 * @property string $content
 * @property int|null $position
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 */
class SupportSavedReply extends AbstractModel
{
    protected $table = 'linkrobins_support_saved_replies';

    public $timestamps = true;
}
