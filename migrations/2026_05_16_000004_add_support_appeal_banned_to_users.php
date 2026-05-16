<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Per-user flag that permanently disables appeal-ticket creation.
// Set by admin from the user's profile or from a rejected appeal.
// Independent of Flarum's regular ban system -- a user can be unbanned
// from the forum but still appeal-banned, or vice versa.

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
