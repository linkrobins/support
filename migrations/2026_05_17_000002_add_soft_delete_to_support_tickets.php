<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;


return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index('deleted_at');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->dropIndex('linkrobins_support_tickets_deleted_at_index');
            $table->dropColumn('deleted_at');
        });
    },
];
