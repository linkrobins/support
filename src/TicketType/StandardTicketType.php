<?php

namespace LinkRobins\Support\TicketType;

use Flarum\Locale\TranslatorInterface;

/**
 * Ordinary support tickets. Every behaviour is AbstractTicketType's default:
 * suspended users cannot file, owners may reopen and confirm solved, and
 * there are no decisions.
 */
class StandardTicketType extends AbstractTicketType
{
    public const ID = 'standard';

    public function __construct(
        protected ?TranslatorInterface $translator = null
    ) {
    }

    public function id(): string
    {
        return self::ID;
    }

    public function name(): string
    {
        return $this->translator
            ? $this->translator->trans('linkrobins-support.admin.ticket_types.standard')
            : 'Standard Support';
    }
}
