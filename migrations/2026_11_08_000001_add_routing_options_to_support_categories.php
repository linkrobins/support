<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_support_categories', function (Blueprint $table) use ($schema) {
            if (! $schema->hasColumn('linkrobins_support_categories', 'default_assigned_group_id')) {
                // Null means no group routing: tickets in this category route
                // according to default_assignee_id, or fall back to all staff.
                $table->integer('default_assigned_group_id')->unsigned()->nullable();

                $table->foreign('default_assigned_group_id', 'support_categories_default_group_foreign')
                    ->references('id')->on('groups')
                    ->nullOnDelete();
            }

            if (! $schema->hasColumn('linkrobins_support_categories', 'is_silent')) {
                // When true, staff notifications are muted for tickets in this category.
                $table->boolean('is_silent')->default(false);
            }
        });
    },

    'down' => function (Builder $schema) {
        try {
            $schema->table('linkrobins_support_categories', function (Blueprint $table) {
                $table->dropForeign('support_categories_default_group_foreign');
            });
        } catch (\Throwable $e) {
            // Already absent (partial rollback) -- nothing to drop.
        }

        $schema->table('linkrobins_support_categories', function (Blueprint $table) use ($schema) {
            if ($schema->hasColumn('linkrobins_support_categories', 'default_assigned_group_id')) {
                $table->dropColumn('default_assigned_group_id');
            }

            if ($schema->hasColumn('linkrobins_support_categories', 'is_silent')) {
                $table->dropColumn('is_silent');
            }
        });
    },
];
