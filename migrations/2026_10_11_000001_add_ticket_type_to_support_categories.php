<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'ticket_type')) {
            $schema->table('linkrobins_support_categories', function (Blueprint $table) {
                $table->string('ticket_type', 64)->default('standard');
            });
        }

        $db = $schema->getConnection();
        if ($schema->hasColumn('linkrobins_support_categories', 'is_appeal')) {
            $db->table('linkrobins_support_categories')
                ->where('is_appeal', true)
                ->update(['ticket_type' => 'appeal']);

            $db->table('linkrobins_support_categories')
                ->where('is_appeal', false)
                ->update(['ticket_type' => 'standard']);

            $schema->table('linkrobins_support_categories', function (Blueprint $table) {
                $table->dropColumn('is_appeal');
            });
        }
    },

    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('linkrobins_support_categories', 'is_appeal')) {
            $schema->table('linkrobins_support_categories', function (Blueprint $table) {
                $table->boolean('is_appeal')->default(false);
            });

            $db = $schema->getConnection();
            $db->table('linkrobins_support_categories')
                ->where('ticket_type', 'appeal')
                ->update(['is_appeal' => true]);
        }

        if ($schema->hasColumn('linkrobins_support_categories', 'ticket_type')) {
            $schema->table('linkrobins_support_categories', function (Blueprint $table) {
                $table->dropColumn('ticket_type');
            });
        }
    },
];
