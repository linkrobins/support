<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_categories', 'allowed_group_ids')) {
            return;
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->json('allowed_group_ids')->nullable();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'allowed_group_ids')) {
            return;
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->dropColumn('allowed_group_ids');
        });
    },
];
