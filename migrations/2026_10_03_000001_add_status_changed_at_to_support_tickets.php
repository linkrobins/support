<?php

use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// When the ticket last changed status. Auto-closing a resolved ticket counts
// its quiet period from here, because last_reply_at only moves on a reply: a
// ticket resolved today whose last reply was three weeks ago would otherwise
// close on the very next run.
//
// Existing resolved tickets are stamped with the time of the upgrade, so
// every one of them gets the full waiting period from now rather than being
// closed in bulk the first time the scheduler runs. Other statuses are left
// null; the column is only read for resolved tickets, and any later status
// change stamps it.
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_tickets', 'status_changed_at')) {
            $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
                $table->dateTime('status_changed_at')->nullable();
            });
        }

        $schema->getConnection()
            ->table('linkrobins_support_tickets')
            ->where('status', 'resolved')
            ->whereNull('status_changed_at')
            ->update(['status_changed_at' => Carbon::now()]);
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_tickets', 'status_changed_at')) {
            return;
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->dropColumn('status_changed_at');
        });
    },
];
