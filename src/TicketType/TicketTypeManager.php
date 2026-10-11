<?php

namespace LinkRobins\Support\TicketType;

use Illuminate\Contracts\Container\Container;
use InvalidArgumentException;

class TicketTypeManager
{
    /**
     * @var array<string, class-string<TicketTypeInterface>|TicketTypeInterface>
     */
    protected array $drivers = [];

    /**
     * @var array<string, TicketTypeInterface>
     */
    protected array $resolved = [];

    public function __construct(
        protected Container $container
    ) {
    }

    /**
     * Register a ticket type driver class or instance.
     *
     * @param string $id
     * @param class-string<TicketTypeInterface>|TicketTypeInterface $driver
     */
    public function register(string $id, string|TicketTypeInterface $driver): void
    {
        $this->drivers[$id] = $driver;
        unset($this->resolved[$id]);
    }

    /**
     * Get a ticket type driver instance by ID.
     */
    public function get(string $id): TicketTypeInterface
    {
        if (isset($this->resolved[$id])) {
            return $this->resolved[$id];
        }

        if (! isset($this->drivers[$id])) {
            // Fallback to standard if unknown
            if (isset($this->drivers[StandardTicketType::ID])) {
                return $this->resolved[StandardTicketType::ID] ??= $this->resolve($this->drivers[StandardTicketType::ID]);
            }
            return $this->resolved[StandardTicketType::ID] ??= $this->resolve(StandardTicketType::class);
        }

        return $this->resolved[$id] = $this->resolve($this->drivers[$id]);
    }

    /**
     * Check if a ticket type is registered.
     */
    public function has(string $id): bool
    {
        return isset($this->drivers[$id]);
    }

    /**
     * Get all registered ticket type drivers.
     *
     * @return array<string, TicketTypeInterface>
     */
    public function all(): array
    {
        $resolved = [];
        foreach ($this->drivers as $id => $driver) {
            $resolved[$id] = $this->get($id);
        }
        return $resolved;
    }

    protected function resolve(string|TicketTypeInterface $driver): TicketTypeInterface
    {
        if (is_string($driver)) {
            $instance = $this->container->make($driver);
            if (! $instance instanceof TicketTypeInterface) {
                throw new InvalidArgumentException("Ticket type [{$driver}] must implement TicketTypeInterface.");
            }
            return $instance;
        }

        return $driver;
    }
}
