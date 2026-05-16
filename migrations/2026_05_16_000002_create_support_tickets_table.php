<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->create('linkrobins_support_tickets', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('category_id')->unsigned()->nullable();
            $table->integer('user_id')->unsigned()->nullable();
            $table->integer('assigned_staff_id')->unsigned()->nullable();
            $table->string('subject');
            // Status workflow:
            //   open           - just submitted, awaiting staff
            //   in_progress    - staff picked it up
            //   awaiting_user  - staff replied asking for info, waiting on creator
            //   resolved       - staff marked complete, creator can reopen by replying
            //   closed         - final, no further replies accepted
            $table->string('status', 32)->default('open');
            // Appeal decision -- meaningful only when category.is_appeal=true.
            // pending / accepted / rejected. Independent of status because an
            // appeal can be resolved (status) with a rejected outcome (decision).
            $table->string('decision', 32)->nullable();
            // Sortable activity timestamp -- bumped on every reply so the
            // ticket list can sort by "last activity" without a join.
            $table->timestamp('last_reply_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index('assigned_staff_id');
            $table->index('category_id');
            $table->index('status');
            $table->index('last_reply_at');

            $table->foreign('category_id')
                ->references('id')->on('linkrobins_support_categories')
                ->nullOnDelete();
            $table->foreign('user_id')
                ->references('id')->on('users')
                ->nullOnDelete();
            $table->foreign('assigned_staff_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_support_tickets');
    },
];
