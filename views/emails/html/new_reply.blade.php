<x-mail::html.notification>
    <x-slot:body>
        <p>{{ $translator->trans('linkrobins-support.email.new_reply_body', ['name' => $blueprint->getFromUser()?->display_name ?? $translator->trans('linkrobins-support.email.from_support')]) }}</p>
        <p><strong>{{ $blueprint->reply->ticket?->subject }}</strong></p>
        @if($blueprint->reply->ticket)
            <p><a href="{{ $url->to('forum')->base() . '/support/' . $blueprint->reply->ticket->id }}">{{ $translator->trans('linkrobins-support.email.view_ticket') }}</a></p>
        @endif
    </x-slot:body>

    <x-slot:preview>
        {!! $blueprint->reply->formatContent() !!}
    </x-slot:preview>
</x-mail::html.notification>
