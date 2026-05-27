<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;


return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_tickets', 'deleted_at')) {
            return; // already applied -- avoid a duplicate-column error on re-run
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->index('deleted_at');
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_tickets', 'deleted_at')) {
            return; // already rolled back
        }
        $schema->table('linkrobins_support_tickets', function (Blueprint $table) {
            // Dropping the column also drops its single-column index in
            // MySQL/MariaDB. We deliberately do NOT dropIndex() separately:
            // if the index is already gone (a partial/inconsistent migration
            // state) that throws "1091 Can't DROP INDEX" and aborts the whole
            // rollback, which blocks reinstalling the extension.
            $table->dropColumn('deleted_at');
        });
    },
];
