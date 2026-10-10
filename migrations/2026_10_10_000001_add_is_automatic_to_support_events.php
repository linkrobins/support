<?php

use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Whether a status change was made by the forum rather than by hand: a reply
// moving the ticket (a staff reply to an open ticket, the owner answering a
// question, anyone replying to a resolved ticket) or the auto-close command.
// The timeline words these as automatic instead of crediting the person whose
// reply set them off as if they had picked the status themselves.
//
// Existing rows are backfilled: a move to in progress that landed within two
// seconds of a public reply by the same person on the same ticket was made by
// that reply, and the forum's own resolved-to-closed rows have no actor.
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_events', 'is_automatic')) {
            $schema->table('linkrobins_support_events', function (Blueprint $table) {
                $table->boolean('is_automatic')->default(false);
            });
        }

        $db = $schema->getConnection();

        $db->table('linkrobins_support_events')
            ->where('type', 'status')
            ->whereNull('user_id')
            ->where('from_status', 'resolved')
            ->where('to_status', 'closed')
            ->update(['is_automatic' => true]);

        $db->table('linkrobins_support_events')
            ->where('type', 'status')
            ->where('is_automatic', false)
            ->whereNotNull('user_id')
            ->where('to_status', 'in_progress')
            ->whereIn('from_status', ['open', 'awaiting_user', 'resolved'])
            ->orderBy('id')
            ->chunkById(100, function ($events) use ($db) {
                foreach ($events as $event) {
                    $at = Carbon::parse($event->created_at);

                    $byReply = $db->table('linkrobins_support_replies')
                        ->where('ticket_id', $event->ticket_id)
                        ->where('user_id', $event->user_id)
                        ->where('is_internal_note', false)
                        ->whereBetween('created_at', [$at->copy()->subSeconds(2), $at->copy()->addSeconds(2)])
                        ->exists();

                    if ($byReply) {
                        $db->table('linkrobins_support_events')->where('id', $event->id)->update(['is_automatic' => true]);
                    }
                }
            });
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_events', 'is_automatic')) {
            return;
        }
        $schema->table('linkrobins_support_events', function (Blueprint $table) {
            $table->dropColumn('is_automatic');
        });
    },
];
