<x-mail::plain.notification>
<x-slot:body>
{{ $translator->trans('linkrobins-support.email.new_ticket_body', ['type' => $blueprint->ticket->isAppeal() ? $translator->trans('linkrobins-support.email.ticket_type_appeal') : $translator->trans('linkrobins-support.email.ticket_type_general'), 'name' => $blueprint->getFromUser()?->display_name ?? $translator->trans('linkrobins-support.email.from_a_user')]) }}

  {{ $blueprint->ticket->subject }}

{{ $translator->trans('linkrobins-support.email.open_ticket') }}: {{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}
</x-slot:body>
</x-mail::plain.notification>
