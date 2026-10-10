<?php

namespace LinkRobins\Support\Extend;

use Flarum\Extend\ExtenderInterface;
use Flarum\Extension\Extension;
use Illuminate\Contracts\Container\Container;
use LinkRobins\Support\TicketType\TicketTypeInterface;
use LinkRobins\Support\TicketType\TicketTypeManager;

class TicketType implements ExtenderInterface
{
    /**
     * @var array<string, class-string<TicketTypeInterface>|TicketTypeInterface>
     */
    protected array $types = [];

    /**
     * Register a ticket type driver.
     *
     * @param string $id
     * @param class-string<TicketTypeInterface>|TicketTypeInterface $driver
     */
    public function add(string $id, string|TicketTypeInterface $driver): self
    {
        $this->types[$id] = $driver;
        return $this;
    }

    public function extend(Container $container, ?Extension $extension = null): void
    {
        $container->resolving(TicketTypeManager::class, function (TicketTypeManager $manager) {
            foreach ($this->types as $id => $driver) {
                $manager->register($id, $driver);
            }
        });
    }
}
