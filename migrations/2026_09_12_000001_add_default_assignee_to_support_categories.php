<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Raw up/down rather than the Migration::addColumns helper: that helper is
// columns-only and cannot express the foreign key this needs. Both directions
// are guarded so a partial migration state doesn't abort a rollback or a
// reinstall (the same trap the deleted_at migration documents).
return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_categories', 'default_assignee_id')) {
            return; // already applied -- avoid a duplicate-column error on re-run
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            // Null means "no auto-assign": tickets in this category arrive
            // unassigned and every staff member is notified, which is the
            // behaviour every existing category keeps on upgrade.
            //
            // On SQLite the foreign key is silently skipped (the grammar can
            // only attach one at CREATE TABLE time). Nothing depends on it:
            // a default assignee is resolved through User::find() and
            // re-checked for staff permission on every use, so a dangling id
            // reads exactly like an unset one.
            $table->integer('default_assignee_id')->unsigned()->nullable();

            $table->foreign('default_assignee_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'default_assignee_id')) {
            return; // already rolled back
        }

        // Separate statements, and the constraint drop is allowed to fail: it
        // is already absent on SQLite and on any partially-rolled-back
        // install, and a throw here would abort the whole rollback and block
        // reinstalling the extension. The try must wrap the ->table() call,
        // not the ->dropForeign() inside the closure -- blueprint commands are
        // only compiled and run once the closure returns.
        try {
            $schema->table('linkrobins_support_categories', function (Blueprint $table) {
                $table->dropForeign(['default_assignee_id']);
            });
        } catch (\Throwable $e) {
            // No such constraint. Dropping the column below still works.
        }

        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->dropColumn('default_assignee_id');
        });
    },
];
