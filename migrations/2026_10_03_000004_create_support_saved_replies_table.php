<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;

// Saved replies: common answers staff insert into a reply and then edit.
// The text is kept as the raw Markdown/BBCode a person would type, since it
// goes into the editor, not straight onto the page.
return Migration::createTableIfNotExists('linkrobins_support_saved_replies', function (Blueprint $table) {
    $table->increments('id');
    $table->string('title', 100);
    $table->text('content');
    $table->integer('position')->unsigned()->nullable();
    $table->timestamps();
});
