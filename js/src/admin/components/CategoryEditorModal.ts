import FormModal from 'flarum/common/components/FormModal';
import Form from 'flarum/common/components/Form';
import Button from 'flarum/common/components/Button';
import ColorPreviewInput from 'flarum/common/components/ColorPreviewInput';
import { tx, saveCategory, deleteCategory } from '../utils';

/**
 * Create/edit a support category. Built on core's FormModal so it matches the
 * Tags "New Tag" modal (a real <form>, Form-wrapped fields, a Form-controls
 * submit/delete row).
 */
export default class CategoryEditorModal extends FormModal {
  category: any = null;
  editId: any = null;
  name = '';
  slug = '';
  description = '';
  color = '#07adcc';
  icon = 'fas fa-folder';
  position = 0;
  isAppeal = false;
  saving = false;
  error: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    const category = this.attrs && this.attrs.category;
    this.category = category || null;
    this.editId = category ? category.id() : null;
    this.name = (category && category.name()) || '';
    this.slug = (category && category.slug()) || '';
    this.description = (category && category.description()) || '';
    this.color = (category && category.color()) || '#07adcc';
    this.icon = (category && category.icon()) || 'fas fa-folder';
    this.position = category && category.position() !== undefined ? category.position() : 0;
    this.isAppeal = !!(category && category.isAppeal());
    this.saving = false;
    this.error = null;
  }

  className() {
    return 'LinkRobinsSupportCategoryEditorModal Modal--small';
  }

  title() {
    return this.editId
      ? tx('linkrobins-support.admin.category_editor.title_edit')
      : tx('linkrobins-support.admin.category_editor.title_new');
  }

  content() {
    const colorField = m(ColorPreviewInput, {
      className: 'FormControl',
      placeholder: '#07adcc',
      value: this.color,
      disabled: this.saving,
      oninput: (e: any) => {
        this.color = e.target.value;
      },
      onchange: (e: any) => {
        this.color = e.target.value;
      },
    });

    const groups = [
      m('div', { className: 'Form-group' }, [
        m('label', null, tx('linkrobins-support.admin.category_editor.field_name')),
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.name,
          disabled: this.saving,
          oninput: (e: any) => {
            this.name = e.target.value;
          },
        }),
      ]),

      m('div', { className: 'Form-group' }, [
        m('label', null, tx('linkrobins-support.admin.category_editor.field_slug')),
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.slug,
          placeholder: tx('linkrobins-support.admin.category_editor.field_slug_placeholder'),
          disabled: this.saving,
          oninput: (e: any) => {
            this.slug = e.target.value;
          },
        }),
        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_slug_help')),
      ]),

      m('div', { className: 'Form-group' }, [
        m('label', null, tx('linkrobins-support.admin.category_editor.field_description')),
        m('textarea', {
          className: 'FormControl',
          rows: 3,
          value: this.description,
          disabled: this.saving,
          oninput: (e: any) => {
            this.description = e.target.value;
          },
        }),
      ]),

      m('div', { className: 'Form-group' }, [
        m('label', null, tx('linkrobins-support.admin.category_editor.field_color')),
        colorField,
        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_color_help')),
      ]),

      m('div', { className: 'Form-group' }, [
        m('label', null, tx('linkrobins-support.admin.category_editor.field_icon')),
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.icon,
          disabled: this.saving,
          placeholder: 'fas fa-folder',
          oninput: (e: any) => {
            this.icon = e.target.value;
          },
        }),
        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_icon_help')),
      ]),

      m('div', { className: 'Form-group' }, [
        m('label', null, tx('linkrobins-support.admin.category_editor.field_position')),
        m('input', {
          type: 'number',
          className: 'FormControl',
          value: this.position,
          disabled: this.saving,
          oninput: (e: any) => {
            this.position = parseInt(e.target.value, 10) || 0;
          },
        }),
        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_position_help')),
      ]),

      m('div', { className: 'Form-group' }, [
        m(
          'div',
          null,
          m('label', { className: 'checkbox' }, [
            m('input', {
              type: 'checkbox',
              checked: this.isAppeal,
              disabled: this.saving,
              onchange: (e: any) => {
                this.isAppeal = !!e.target.checked;
              },
            }),
            ' ' + tx('linkrobins-support.admin.category_editor.field_is_appeal'),
          ])
        ),
        m('div', { className: 'helpText' }, tx('linkrobins-support.admin.category_editor.field_is_appeal_help')),
      ]),

      m('div', { className: 'Form-group Form-controls' }, [
        m(
          Button,
          {
            type: 'submit',
            className: 'Button Button--primary',
            loading: this.saving,
            disabled: !this.name.trim(),
          },
          this.editId
            ? tx('linkrobins-support.admin.category_editor.submit_update')
            : tx('linkrobins-support.admin.category_editor.submit_create')
        ),

        this.editId
          ? m(
              'button',
              {
                type: 'button',
                className: 'Button LinkRobinsSupportCategoryEditorModal-delete',
                disabled: this.saving,
                onclick: () => {
                  this._delete();
                },
              },
              tx('linkrobins-support.admin.categories.delete_button')
            )
          : null,
      ]),
    ];

    return m('div', { className: 'Modal-body' }, [
      this.error ? m('div', { className: 'Alert Alert--danger' }, this._errorMessage()) : null,
      m(Form, null, groups),
    ]);
  }

  onsubmit(e: any) {
    if (e && e.preventDefault) e.preventDefault();
    if (this.saving || !this.name.trim()) return;
    this._save();
  }

  _errorMessage() {
    const err = this.error;
    if (!err) return tx('linkrobins-support.admin.common.unknown_error');
    try {
      const errors = err.response && err.response.errors;
      if (errors && errors[0]) {
        return errors[0].detail || errors[0].title || tx('linkrobins-support.admin.rate_limits.error_save');
      }
    } catch (e) {}
    return tx('linkrobins-support.admin.category_editor.error_save');
  }

  _save() {
    this.saving = true;
    this.error = null;
    m.redraw();

    const attrs: any = {
      name: this.name.trim(),
      description: this.description,
      color: this.color,
      icon: this.icon,
      position: this.position,
      isAppeal: this.isAppeal,
    };
    if (this.slug && this.slug.trim()) {
      attrs.slug = this.slug.trim();
    }

    saveCategory(this.category, attrs)
      .then(() => {
        this.saving = false;
        try {
          if (this.attrs.onSaved) this.attrs.onSaved();
        } catch (e) {}
        try {
          app.modal.close();
        } catch (e) {}
      })
      .catch((err: any) => {
        this.saving = false;
        this.error = err;
        console.error('[linkrobins/support] save category failed:', err);
        m.redraw();
      });
  }

  // Delete from within the editor (parity with the Tags "New Tag" modal).
  _delete() {
    if (!this.category || !this.editId) return;

    const name = this.category.name() || tx('linkrobins-support.admin.categories.this_category');
    const count = this.category.ticketCount() || 0;
    const warning =
      count > 0
        ? tx('linkrobins-support.admin.categories.delete_confirm_with_tickets', { count })
        : tx('linkrobins-support.admin.categories.delete_confirm_named', { name });
    try {
      if (!window.confirm(warning)) return;
    } catch (e) {}

    this.saving = true;
    this.error = null;
    m.redraw();

    deleteCategory(this.category)
      .then(() => {
        this.saving = false;
        try {
          if (this.attrs.onSaved) this.attrs.onSaved();
        } catch (e) {}
        try {
          app.modal.close();
        } catch (e) {}
      })
      .catch((err: any) => {
        this.saving = false;
        this.error = err;
        console.error('[linkrobins/support] delete category failed:', err);
        m.redraw();
      });
  }
}
