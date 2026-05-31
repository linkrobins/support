<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

// Uses the createTableIfNotExists helper (rather than plain createTable) so the
// rollback stays dropIfExists -- preserving the idempotency the raw form had.
return Migration::createTableIfNotExists('linkrobins_support_categories', function (Blueprint $table) {
    $table->increments('id');
    $table->string('name');
    $table->string('slug')->unique();
    $table->text('description')->nullable();
    $table->string('color', 16)->nullable();
    $table->string('icon', 64)->nullable();
    $table->integer('position')->default(0);
    // Appeal categories enforce extra-strict rate limits and can be
    // created by banned users. Regular categories are just for
    // organizing support requests from active users.
    $table->boolean('is_appeal')->default(false);
    $table->timestamps();

    $table->index('position');
});
