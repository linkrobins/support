<x-mail::html.notification>
    <x-slot:body>
        <p>{{ $translator->trans('linkrobins-support.email.awaiting_reminder_body') }}</p>
        <p><strong>{{ $blueprint->ticket->subject }}</strong></p>
        <p><a href="{{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}">{{ $translator->trans('linkrobins-support.email.view_ticket') }}</a></p>
    </x-slot:body>
</x-mail::html.notification>
