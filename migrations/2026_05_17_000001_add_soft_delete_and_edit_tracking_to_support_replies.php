<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;


return [
    'up' => function (Builder $schema) {
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
        $schema->table('linkrobins_support_replies', function (Blueprint $table) {
            $table->dropForeign(['edited_by_user_id']);
            $table->dropIndex('linkrobins_support_replies_deleted_at_index');
            $table->dropColumn(['deleted_at', 'edited_at', 'edited_by_user_id']);
        });
    },
];
