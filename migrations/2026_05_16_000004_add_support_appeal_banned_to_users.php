<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;


return [
    'up' => function (Builder $schema) {
        $schema->table('users', function (Blueprint $table) {
            $table->boolean('support_appeal_banned')
                ->default(false)
                ->after('is_email_confirmed');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('users', function (Blueprint $table) {
            $table->dropColumn('support_appeal_banned');
        });
    },
];
