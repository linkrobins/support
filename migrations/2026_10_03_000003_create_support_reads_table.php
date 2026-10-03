<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

// When each person last read each ticket, for the unread markers in the
// ticket lists. One row per ticket per reader, overwritten on every visit.
// Short table name for the same reason as linkrobins_support_events: the
// foreign key identifiers carry the table prefix and MySQL caps them at 64.
return Migration::createTableIfNotExists('linkrobins_support_reads', function (Blueprint $table) {
    $table->integer('ticket_id')->unsigned();
    $table->integer('user_id')->unsigned();
    $table->dateTime('last_read_at');

    $table->primary(['ticket_id', 'user_id']);
    $table->index('user_id');

    $table->foreign('ticket_id')
        ->references('id')->on('linkrobins_support_tickets')
        ->cascadeOnDelete();
    $table->foreign('user_id')
        ->references('id')->on('users')
        ->cascadeOnDelete();
});
