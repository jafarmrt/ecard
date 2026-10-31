export interface EmployeeAnalytics {
  views: number;
  nfcTaps: number;
  qrScans: number;
  callClicks: number;
  whatsappClicks: number;
  catalogDownloads: number;
  vcardDownloads: number;
  mapClicks: number;
  instagramClicks?: number;
  websiteClicks?: number;
  emailClicks?: number;
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
  /** One of LEAD_TOPICS (see src/utils/leadTopics.ts). */
  topic?: string;
  note?: string;
  /** When the visitor agreed to be contacted. */
  consentAt?: string;
  /** How the visitor reached the card: nfc, qr, link or a campaign code. */
  source?: string;
  createdAt: string;
}

export type ProfileStatus = 'active' | 'inactive' | 'archived';

export interface MapLocation {
  lat: number;
  lng: number;
  title: string;
  googleMapsUrl: string;
  neshanUrl: string;
  baladUrl: string;
  wazeUrl: string;
}

/** Company-wide settings, defined once and inherited by every card. */
export interface Organization {
  company: string;
  companyEn: string;
  slogan: string;
  logoUrl?: string;
  website: string;
  websiteUrl: string;
  instagram: string;
  instagramUrl: string;
  catalogUrl?: string;
  catalogPdfUrl?: string;
  layoutDirection: 'rtl' | 'ltr';
}

/** An office / showroom. Cards inherit address, phone and map from their branch. */
export interface Branch {
  id: string;
  name: string;
  address: string;
  postalCode?: string;
  landline?: string;
  mapLocation: MapLocation;
  isDefault?: boolean;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId?: string;
  summary?: string;
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
  mapLocation: MapLocation;
  /** Lifecycle: archived cards redirect to `redirectTo` (another card) or show the company page. */
  status?: ProfileStatus;
  branchId?: string;
  redirectTo?: string;
  archivedAt?: string;
  /** Earlier short links that still open this card. */
  previousSlugs?: string[];
  /** Admin only: which inherited fields this card overrides. */
  overrides?: string[];
  createdAt?: string;
  updatedAt?: string;
}

