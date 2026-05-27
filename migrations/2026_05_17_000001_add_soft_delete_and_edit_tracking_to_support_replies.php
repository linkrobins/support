<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;


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

        $conn  = $schema->getConnection();
        $table = $conn->getTablePrefix() . 'linkrobins_support_replies';

        // The FK must be dropped before the column, but only if it actually
        // exists -- on a partial/inconsistent state dropForeign() would throw.
        $fk = $conn->selectOne(
            'SELECT constraint_name FROM information_schema.key_column_usage'
            . ' WHERE table_schema = ? AND table_name = ? AND column_name = ?'
            . ' AND referenced_table_name IS NOT NULL LIMIT 1',
            [$conn->getDatabaseName(), $table, 'edited_by_user_id']
        );
        if ($fk) {
            $schema->table('linkrobins_support_replies', function (Blueprint $table) {
                $table->dropForeign(['edited_by_user_id']);
            });
        }

        $schema->table('linkrobins_support_replies', function (Blueprint $table) {
            // dropColumn drops the deleted_at single-column index automatically;
            // no explicit dropIndex (which throws 1091 if it's already gone).
            $table->dropColumn(['deleted_at', 'edited_at', 'edited_by_user_id']);
        });
    },
];
