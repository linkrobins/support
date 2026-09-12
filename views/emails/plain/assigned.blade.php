<x-mail::plain.notification>
<x-slot:body>
{{ $translator->trans('linkrobins-support.email.assigned_body', ['name' => $blueprint->getFromUser()?->display_name ?? $translator->trans('linkrobins-support.email.from_support')]) }}

  {{ $blueprint->ticket->subject }}

{{ $translator->trans('linkrobins-support.email.view_ticket') }}: {{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}
</x-slot:body>
</x-mail::plain.notification>
