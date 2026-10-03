<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// When the owner was last reminded that a ticket is waiting on them. One
// reminder per wait: a ticket is reminded again only after its status has
// changed since (status_changed_at is later than this).
return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_tickets', 'reminded_at')) {
            return;
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->dateTime('reminded_at')->nullable();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_tickets', 'reminded_at')) {
            return;
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->dropColumn('reminded_at');
        });
    },
];
