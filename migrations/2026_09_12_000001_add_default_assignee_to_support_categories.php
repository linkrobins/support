<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Raw up/down rather than the Migration::addColumns helper so the up is
// guarded against a partial migration state (the same trap the deleted_at
// migration documents).
//
// Deliberately no foreign key on default_assignee_id, unlike the ticket
// table's assigned_staff_id. Laravel names a constraint after the prefixed
// table plus the column, which here comes to
// `<prefix>linkrobins_support_categories_default_assignee_id_foreign` -- past
// MySQL's 64-character identifier limit for any prefix longer than about four
// characters, so a prefixed install could not run this migration at all. An
// explicit shorter name is not a fix either: it would not carry the prefix,
// so two forums sharing one database (exactly what prefixes are for) would
// collide on it.
//
// Nothing depends on the constraint. A default assignee is resolved through
// SupportCategory::effectiveDefaultAssignee(), which loads the user and
// re-checks their staff permission on every use, so a row pointing at a
// deleted account reads exactly like an unset one: no routing, and the whole
// staff list is notified.
return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('linkrobins_support_categories', 'default_assignee_id')) {
            return; // already applied -- avoid a duplicate-column error on re-run
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            // Null means "no auto-assign": tickets in this category arrive
            // unassigned and every staff member is notified, which is the
            // behaviour every existing category keeps on upgrade.
            $table->integer('default_assignee_id')->unsigned()->nullable();
        });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'default_assignee_id')) {
            return; // already rolled back
        }
        $schema->table('linkrobins_support_categories', function (Blueprint $table) {
            $table->dropColumn('default_assignee_id');
        });
    },
];
