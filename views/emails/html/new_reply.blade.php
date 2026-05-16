<x-mail::html.notification>
    <x-slot:body>
        <p>{{ $blueprint->getFromUser()?->display_name ?? 'Support' }} replied to your support ticket:</p>
        <p><strong>{{ $blueprint->reply->ticket?->subject }}</strong></p>
        @if($blueprint->reply->ticket)
            <p><a href="{{ $url->to('forum')->base() . '/support/' . $blueprint->reply->ticket->id }}">View the ticket</a></p>
        @endif
    </x-slot:body>

    <x-slot:preview>
        {!! $blueprint->reply->formatContent() !!}
    </x-slot:preview>
</x-mail::html.notification>
