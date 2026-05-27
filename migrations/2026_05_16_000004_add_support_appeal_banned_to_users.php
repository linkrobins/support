<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;


return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('users', 'support_appeal_banned')) {
            return;
        }
        $schema->table('users', function (Blueprint $table) {
            // No ->after(): column placement is MySQL-only syntax and
            // ordering is irrelevant, so this stays portable to PostgreSQL.
            $table->boolean('support_appeal_banned')->default(false);
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('users', function (Blueprint $table) {
            $table->dropColumn('support_appeal_banned');
        });
    },
];
