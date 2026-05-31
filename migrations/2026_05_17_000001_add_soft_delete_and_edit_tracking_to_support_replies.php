<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Kept as a raw up/down array (not the Migration::addColumns helper): that
// helper is columns-only and cannot express the deleted_at index or the
// edited_by_user_id foreign key this migration needs. The down() is also
// deliberately hand-written to be idempotent and cross-DB safe (see below).
return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_replies', 'deleted_at')) {
            return; // already applied
        }
        $schema->table('linkrobins_support_replies', function (Blueprint $table) {
            $table->timestamp('deleted_at')->nullable();
            $table->timestamp('edited_at')->nullable();
            $table->integer('edited_by_user_id')->unsigned()->nullable();

            $table->index('deleted_at');

            $table->foreign('edited_by_user_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_replies', 'deleted_at')) {
            return; // already rolled back
        }

        // The FK must be dropped before the column. Attempt it inside a
        // try/catch rather than probing information_schema first: that probe
        // is MySQL/MariaDB-only (information_schema.key_column_usage does not
        // exist on PostgreSQL or SQLite, both first-class Flarum targets) and
        // would fatal the rollback there. dropForeign() simply throwing on a
        // partial/inconsistent state (FK already gone) is harmless and portable.
        try {
            $schema->table('linkrobins_support_replies', function (Blueprint $table) {
                $table->dropForeign(['edited_by_user_id']);
            });
        } catch (\Throwable $e) {
            // FK already absent (partial rollback) -- nothing to drop.
        }

        $schema->table('linkrobins_support_replies', function (Blueprint $table) {
            // dropColumn drops the deleted_at single-column index automatically;
            // no explicit dropIndex (which throws 1091 if it's already gone).
            $table->dropColumn(['deleted_at', 'edited_at', 'edited_by_user_id']);
        });
    },
];
