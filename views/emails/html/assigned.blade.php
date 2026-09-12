<x-mail::html.notification>
    <x-slot:body>
        <p>{{ $translator->trans('linkrobins-support.email.assigned_body', ['name' => $blueprint->getFromUser()?->display_name ?? $translator->trans('linkrobins-support.email.from_support')]) }}</p>
        <p><strong>{{ $blueprint->ticket->subject }}</strong></p>
        <p><a href="{{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}">{{ $translator->trans('linkrobins-support.email.view_ticket') }}</a></p>
    </x-slot:body>
</x-mail::html.notification>
