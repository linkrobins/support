<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_categories', 'is_silent')) {
            return;
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            // When true, general staff notifications are muted for tickets in this category.
            $table->boolean('is_silent')->default(false);
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'is_silent')) {
            return;
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->dropColumn('is_silent');
        });
    },
];
