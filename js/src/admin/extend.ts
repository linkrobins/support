import Extend from 'flarum/common/extenders';
import app from 'flarum/admin/app';
import commonExtend from '../common/extend';
import SupportAdminPage from './components/SupportAdminPage';

export default [
  ...commonExtend,

  new Extend.Admin()
    .page(SupportAdminPage)
    .permission(
      () => ({
        permission: 'lr-support.handle_tickets',
        icon: 'fas fa-life-ring',
        label: app.translator.trans('linkrobins-support.admin.permissions.handle_tickets'),
      }),
      'moderate',
      95
    )
    .permission(
      () => ({
        permission: 'lr-support.manage_appeal_bans',
        icon: 'fas fa-ban',
        label: app.translator.trans('linkrobins-support.admin.permissions.manage_appeal_bans'),
      }),
      'moderate',
      94
    )
    .permission(
      () => ({
        permission: 'lr-support.force_delete_tickets',
        icon: 'fas fa-trash',
        label: app.translator.trans('linkrobins-support.admin.permissions.force_delete_tickets'),
      }),
      'moderate',
      93
    ),
];
