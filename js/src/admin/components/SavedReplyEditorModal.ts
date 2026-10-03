import FormModal from 'flarum/common/components/FormModal';
import Form from 'flarum/common/components/Form';
import Button from 'flarum/common/components/Button';
import { tx } from '../utils';

/**
 * Create or edit a saved reply. Same shape as the category editor: a real
 * form, Form-wrapped fields, Save and Delete in the controls row.
 */
export default class SavedReplyEditorModal extends FormModal<any> {
  reply: any = null;
  replyTitle = '';
  replyContent = '';
  position: string = '';
  saving = false;
  error: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.reply = this.attrs.reply || null;
    this.replyTitle = this.reply ? this.reply.title() || '' : '';
    this.replyContent = this.reply ? this.reply.content() || '' : '';
    const pos = this.reply ? this.reply.position() : null;
    this.position = pos === null || pos === undefined ? '' : String(pos);
  }

  className() {
    return 'LinkRobinsSupportSavedReplyModal';
  }

  title() {
    return this.reply ? tx('linkrobins-support.admin.saved_replies.title_edit') : tx('linkrobins-support.admin.saved_replies.title_new');
  }

  content() {
    const canSave = !!this.replyTitle.trim() && !!this.replyContent.trim();

    return m('div', { className: 'Modal-body' }, [
      this.error ? m('div', { className: 'Alert Alert--danger' }, this._errorMessage()) : null,
      m(Form, null, [
        m('div', { className: 'Form-group' }, [
          m('label', null, tx('linkrobins-support.admin.saved_replies.field_title')),
          m('input', {
            type: 'text',
            className: 'FormControl',
            maxlength: 100,
            value: this.replyTitle,
            disabled: this.saving,
            oninput: (e: any) => {
              this.replyTitle = e.target.value;
            },
          }),
          m('div', { className: 'helpText' }, tx('linkrobins-support.admin.saved_replies.field_title_help')),
        ]),
        m('div', { className: 'Form-group' }, [
          m('label', null, tx('linkrobins-support.admin.saved_replies.field_content')),
          m('textarea', {
            className: 'FormControl',
            rows: 8,
            maxlength: 10000,
            value: this.replyContent,
            disabled: this.saving,
            oninput: (e: any) => {
              this.replyContent = e.target.value;
            },
          }),
          m('div', { className: 'helpText' }, tx('linkrobins-support.admin.saved_replies.field_content_help')),
        ]),
        m('div', { className: 'Form-group' }, [
          m('label', null, tx('linkrobins-support.admin.saved_replies.field_position')),
          m('input', {
            type: 'number',
            className: 'FormControl',
            min: 0,
            value: this.position,
            disabled: this.saving,
            oninput: (e: any) => {
              this.position = e.target.value;
            },
          }),
          m('div', { className: 'helpText' }, tx('linkrobins-support.admin.saved_replies.field_position_help')),
        ]),
        m('div', { className: 'Form-group Form-controls' }, [
          m(
            Button,
            { type: 'submit', className: 'Button Button--primary', loading: this.saving, disabled: !canSave },
            this.reply ? tx('linkrobins-support.admin.saved_replies.submit_update') : tx('linkrobins-support.admin.saved_replies.submit_create')
          ),
          this.reply
            ? m(
                'button',
                {
                  type: 'button',
                  className: 'Button LinkRobinsSupportCategoryEditorModal-delete',
                  disabled: this.saving,
                  onclick: () => this._delete(),
                },
                tx('linkrobins-support.admin.saved_replies.delete_button')
              )
            : null,
        ]),
      ]),
    ]);
  }

  onsubmit(e: any) {
    if (e && e.preventDefault) e.preventDefault();
    if (this.saving || !this.replyTitle.trim() || !this.replyContent.trim()) return;

    this.saving = true;
    this.error = null;
    m.redraw();

    const record = this.reply || app.store.createRecord('linkrobins-support-saved-replies');
    const pos = this.position.trim();
    record
      .save({ title: this.replyTitle.trim(), content: this.replyContent, position: pos === '' ? null : parseInt(pos, 10) })
      .then(() => this._done())
      .catch((err: any) => this._failed(err));
  }

  _delete() {
    if (!this.reply) return;
    try {
      if (!window.confirm(tx('linkrobins-support.admin.saved_replies.delete_confirm', { name: this.reply.title() }))) return;
    } catch (e) {}

    this.saving = true;
    this.error = null;
    m.redraw();
    this.reply
      .delete()
      .then(() => this._done())
      .catch((err: any) => this._failed(err));
  }

  _done() {
    this.saving = false;
    try {
      if (this.attrs.onSaved) this.attrs.onSaved();
    } catch (e) {}
    app.modal.close();
  }

  _failed(err: any) {
    this.saving = false;
    this.error = err;
    console.error('[linkrobins/support] saved reply save failed:', err);
    m.redraw();
  }

  _errorMessage() {
    try {
      const errors = this.error && this.error.response && this.error.response.errors;
      if (errors && errors[0]) return errors[0].detail || errors[0].title;
    } catch (e) {}
    return tx('linkrobins-support.admin.saved_replies.error_save');
  }
}
