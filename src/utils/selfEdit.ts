import type { SelfEditField } from '../types';

/** Persian names of the fields an employee may change on their own card. */
export const SELF_EDIT_LABEL: Record<SelfEditField, string> = {
  avatarUrl: 'عکس',
  whatsapp: 'واتساپ',
  instagram: 'اینستاگرام',
  email: 'ایمیل',
};

export const SELF_EDIT_ORDER: SelfEditField[] = ['avatarUrl', 'whatsapp', 'instagram', 'email'];
