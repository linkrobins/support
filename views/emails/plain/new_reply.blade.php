<x-mail::plain.notification>
<x-slot:body>
{{ $translator->trans('linkrobins-support.email.new_reply_body', ['name' => $blueprint->getFromUser()?->display_name ?? $translator->trans('linkrobins-support.email.from_support')]) }}

  {{ $blueprint->reply->ticket?->subject }}

@if($blueprint->reply->ticket)
{{ $translator->trans('linkrobins-support.email.view_ticket') }}: {{ $url->to('forum')->base() . '/support/' . $blueprint->reply->ticket->id }}
@endif
</x-slot:body>
</x-mail::plain.notification>
