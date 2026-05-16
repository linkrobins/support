<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
