<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Ticket priority for staff triage: low, normal or urgent. Every existing
// ticket starts as normal, so nothing reorders on upgrade.
return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_tickets', 'priority')) {
            return;
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->string('priority', 10)->default('normal');
            $table->index('priority');
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_tickets', 'priority')) {
            return;
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->dropIndex(['priority']);
            $table->dropColumn('priority');
        });
    },
];
