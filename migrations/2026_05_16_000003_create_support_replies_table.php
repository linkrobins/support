<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

// createTableIfNotExists keeps the rollback as dropIfExists (idempotent).
return Migration::createTableIfNotExists('linkrobins_support_replies', function (Blueprint $table) {
    $table->increments('id');
    $table->integer('ticket_id')->unsigned();
    $table->integer('user_id')->unsigned()->nullable();
    $table->mediumText('content');
    // Internal notes are visible only to staff, never to the ticket
    // creator. The creator literally cannot fetch a reply with
    // is_internal_note=true via the API; the resource scope filters
    // them out.
    $table->boolean('is_internal_note')->default(false);
    $table->timestamps();

    $table->index('ticket_id');
    $table->index('user_id');
    $table->index('is_internal_note');

    $table->foreign('ticket_id')
        ->references('id')->on('linkrobins_support_tickets')
        ->cascadeOnDelete();
    $table->foreign('user_id')
        ->references('id')->on('users')
        ->nullOnDelete();
});
