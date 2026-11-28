<?php

namespace LinkRobins\Support\Search\Filter;

/**
 * Splits string or array filter inputs — including array elements containing
 * comma-separated OR predicates emitted by multi-value gambits — into trimmed
 * non-empty strings.
 */
trait SplitsFilterValuesTrait
{
    /**
     * @param string|array<mixed> $value
     * @return list<string>
     */
    protected function splitFilterValues(string|array $value): array
    {
        $values = [];

        foreach ($this->asStringArray($value) as $item) {
            if (! is_string($item)) {
                continue;
            }
            foreach (explode(',', $item) as $part) {
                $trimmed = trim($part);
                if ($trimmed !== '') {
                    $values[] = $trimmed;
                }
            }
        }

        return $values;
    }
}
