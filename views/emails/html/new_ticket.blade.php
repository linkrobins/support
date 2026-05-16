<x-mail::html.notification>
    <x-slot:body>
        <p>
            A new {{ $blueprint->ticket->isAppeal() ? 'appeal ticket' : 'support ticket' }}
            was just opened by {{ $blueprint->getFromUser()?->display_name ?? 'a user' }}:
        </p>
        <p><strong>{{ $blueprint->ticket->subject }}</strong></p>
        <p><a href="{{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}">Open the ticket</a></p>
    </x-slot:body>

    <x-slot:preview>
        {{ $blueprint->ticket->subject }}
    </x-slot:preview>
</x-mail::html.notification>
