<x-mail::plain.notification>
<x-slot:body>
{{ $blueprint->emailBody($translator, $user) }}

  {{ $blueprint->ticket->subject }}

{{ $translator->trans('linkrobins-support.email.view_ticket') }}: {{ $url->to('forum')->base() . '/support/' . $blueprint->ticket->id }}
</x-slot:body>
</x-mail::plain.notification>
