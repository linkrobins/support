<x-mail::plain.notification>
<x-slot:body>
{{ $blueprint->getFromUser()?->display_name ?? 'Support' }} replied to your support ticket:

  {{ $blueprint->reply->ticket?->subject }}

@if($blueprint->reply->ticket)
View the ticket: {{ $url->to('forum')->base() . '/support/' . $blueprint->reply->ticket->id }}
@endif
</x-slot:body>
</x-mail::plain.notification>
