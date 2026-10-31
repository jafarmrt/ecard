/** Topics a visitor can pick in the lead form (shared by client and server). */
export const LEAD_TOPICS = [
  'مشاوره و انتخاب محصول',
  'استعلام قیمت',
  'دریافت کاتالوگ و نمونه',
  'پروژه و همکاری',
  'سایر',
] as const;

export type LeadTopic = (typeof LEAD_TOPICS)[number];
