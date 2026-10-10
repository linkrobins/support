<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_categories', 'ticket_type')) {
            return;
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->string('ticket_type', 64)->nullable();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'ticket_type')) {
            return;
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->dropColumn('ticket_type');
        });
    },
];
