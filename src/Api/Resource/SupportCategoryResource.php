<?php

namespace LinkRobins\Support\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;
use LinkRobins\Support\SupportCategory;
use Tobyz\JsonApiServer\Context;

class SupportCategoryResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'linkrobins-support-categories';
    }

    public function model(): string
    {
        return SupportCategory::class;
    }

    public function scope(Builder $query, Context $context): void
    {
        // Eager-load the ticket count so the ticketCount field doesn't issue a
        // COUNT() per category (N+1 on the category list).
        $query->withCount('tickets')->orderBy('position')->orderBy('id');
    }

    public function find(string $id, Context $context): ?object
    {
        if (is_numeric($id) && $cat = $this->query($context)->find($id)) {
            return $cat;
        }
        return $this->query($context)->where('slug', $id)->first();
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make(),
            Endpoint\Index::make()
                ->paginate(50, 100),
            Endpoint\Create::make()
                ->authenticated()
                ->can('manageCategories'),
            Endpoint\Update::make()
                ->authenticated()
                ->can('manageCategories'),
            Endpoint\Delete::make()
                ->authenticated()
                ->can('manageCategories'),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('position'),
            SortColumn::make('createdAt'),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('name')
                ->writable()
                ->maxLength(120)
                ->set(function (SupportCategory $cat, $value) {
                    $trimmed = is_string($value) ? trim($value) : '';
                    $cat->name = $trimmed;
                    if (empty($cat->slug)) {
                        $cat->slug = Str::slug($trimmed) ?: 'category';
                    }
                }),

            Schema\Str::make('slug')
                ->writable()
                ->maxLength(120)
                ->set(function (SupportCategory $cat, $value) {
                    $trimmed = is_string($value) ? trim($value) : '';
                    if ($trimmed === '') {
                        return;
                    }
                    $cat->slug = Str::slug($trimmed) ?: 'category';
                }),

            Schema\Str::make('description')
                ->writable()
                ->nullable(),

            Schema\Str::make('color')
                ->writable()
                ->nullable()
                ->set(function (SupportCategory $cat, $value) {
                    $trimmed = is_string($value) ? trim($value) : '';
                    if ($trimmed === '') {
                        $cat->color = null;
                        return;
                    }
                    // Accept #rgb / #rgba / #rrggbb / #rrggbbaa only.
                    if (! preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $trimmed)) {
                        return;
                    }
                    $cat->color = $trimmed;
                }),

            Schema\Str::make('icon')
                ->writable()
                ->nullable()
                ->set(function (SupportCategory $cat, $value) {
                    $trimmed = is_string($value) ? trim($value) : '';
                    if ($trimmed === '') {
                        $cat->icon = null;
                        return;
                    }
                    // Restrict to safe FA-class shapes. We interpolate this
                    // into class="" attributes in the UI, so anything outside
                    // letters/digits/spaces/dashes is unsafe.
                    if (! preg_match('/^[a-z0-9 \-]+$/', $trimmed)) {
                        return;
                    }
                    $cat->icon = $trimmed;
                }),

            Schema\Integer::make('position')
                ->writable(),

            Schema\Boolean::make('isAppeal')
                ->property('is_appeal')
                ->writable(),

            Schema\Integer::make('ticketCount')
                ->get(fn (SupportCategory $cat) => (int) ($cat->tickets_count ?? $cat->tickets()->count())),

            Schema\DateTime::make('createdAt')
                ->property('created_at'),
            Schema\DateTime::make('updatedAt')
                ->property('updated_at'),
        ];
    }
}
