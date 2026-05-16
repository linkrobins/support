<x-mail::plain.notification>
<x-slot:body>
A new {{ $blueprint->ticket->isAppeal() ? 'appeal ticket' : 'support ticket' }} was just opened by {{ $blueprint->getFromUser()?->display_name ?? 'a user' }}:

  {{ $blueprint->ticket->subject }}

Open the ticket: {{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}
</x-slot:body>
</x-mail::plain.notification>
