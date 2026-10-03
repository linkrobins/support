<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

// One row per status or assignment change on a ticket, shown inline in the
// ticket's timeline. user_id is the person who made the change; null means
// the forum did it (auto-close) or that account has since been deleted.
//
// Status and assignment changes get their own typed columns rather than a
// shared from/to string, so assignment ids stay integers and compare cleanly
// against users.id on every database.
//
// The table name is kept short on purpose: Laravel names each foreign key
// after the prefixed table plus the column, and MySQL caps identifiers at 64
// characters, so a longer name breaks installs that use a table prefix. The
// from/to assignee columns carry no foreign key for the same reason; a
// deleted account simply reads as "a deleted user".
return Migration::createTableIfNotExists('linkrobins_support_events', function (Blueprint $table) {
    $table->increments('id');
    $table->integer('ticket_id')->unsigned();
    $table->integer('user_id')->unsigned()->nullable();
    // 'status' or 'assignment'.
    $table->string('type', 20);
    $table->string('from_status', 30)->nullable();
    $table->string('to_status', 30)->nullable();
    $table->integer('from_user_id')->unsigned()->nullable();
    $table->integer('to_user_id')->unsigned()->nullable();
    $table->dateTime('created_at');

    $table->index(['ticket_id', 'created_at']);

    $table->foreign('ticket_id')
        ->references('id')->on('linkrobins_support_tickets')
        ->cascadeOnDelete();
    $table->foreign('user_id')
        ->references('id')->on('users')
        ->nullOnDelete();
});
