<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $color
 * @property string|null $icon
 * @property int $position
 * @property bool $is_appeal
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property-read \Illuminate\Database\Eloquent\Collection<int, SupportTicket> $tickets
 */
class SupportCategory extends AbstractModel
{
    protected $table = 'linkrobins_support_categories';

    public $timestamps = true;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'color',
        'icon',
        'position',
        'is_appeal',
    ];

    protected $casts = [
        'position'  => 'integer',
        'is_appeal' => 'boolean',
    ];

    public function tickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class, 'category_id');
    }
}
