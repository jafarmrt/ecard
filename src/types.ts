export interface EmployeeAnalytics {
  views: number;
  nfcTaps: number;
  qrScans: number;
  callClicks: number;
  whatsappClicks: number;
  catalogDownloads: number;
  vcardDownloads: number;
  mapClicks: number;
  leadCaptures?: number;
  lastInteractionAt?: string;
}

export interface CustomerLead {
  id: string;
  profileId: string;
  profileName: string;
  customerName: string;
  customerMobile: string;
  customerCompany?: string;
  note?: string;
  createdAt: string;
}

export interface EmployeeProfile {
  id: string;
  slug?: string;
  name: string;
  nameEn: string;
  title: string;
  titleEn: string;
  company: string;
  companyEn: string;
  slogan: string;
  mobile: string;
  whatsapp: string;
  landline: string;
  instagram: string;
  instagramUrl: string;
  website: string;
  websiteUrl: string;
  catalogUrl?: string;
  catalogPdfUrl?: string;
  layoutDirection?: 'rtl' | 'ltr';
  email: string;
  address: string;
  postalCode?: string;
  department?: string;
  logoUrl?: string;
  avatarUrl?: string;
  avatarGender?: 'male' | 'female' | 'custom';
  bio?: string;
  analytics?: EmployeeAnalytics;
  mapLocation: {
    lat: number;
    lng: number;
    title: string;
    googleMapsUrl: string;
    neshanUrl: string;
    baladUrl: string;
    wazeUrl: string;
  };
}

export type ViewMode = 'card-only' | 'mobile-mockup' | 'full-preview';
