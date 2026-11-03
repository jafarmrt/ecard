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
  /** How the visitor reached the card: nfc, qr or link. */
  source?: string;
  /** Campaign code from a campaign link (?c=…), if any. */
  campaign?: string;
  createdAt: string;
  /** Follow-up: new (nobody has called yet), contacted, closed. */
  status?: LeadStatus;
  /** What happened when the company called back. */
  followupNote?: string;
  updatedAt?: string;
}

export type LeadStatus = 'new' | 'contacted' | 'closed';

/** The only card fields an employee may change through their private edit link. */
export type SelfEditField = 'avatarUrl' | 'whatsapp' | 'instagram' | 'email';
export type SelfEditValues = Partial<Record<SelfEditField, string>>;

/** A change an employee sent; it reaches the card only after an admin approves it. */
export interface EditRequest {
  id: string;
  profileId: string;
  profileName: string;
  changes: SelfEditValues;
  /** The card's own values right now, to compare with `changes`. */
  current: SelfEditValues;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
}

/** An employee's private edit link (the link itself is shown only once, when created). */
export interface EditLinkInfo {
  profileId: string;
  createdAt: string;
  lastUsedAt?: string;
}

export type ProfileStatus = 'active' | 'inactive' | 'archived';

export type PhysicalCardStatus = 'none' | 'ordered' | 'delivered' | 'lost';

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
  /** Photos of finished projects shown on every card (uploaded images, at most 12). */
  gallery?: string[];
}

/** An office / showroom. Cards inherit address, phone and map from their branch. */
export interface Branch {
  id: string;
  name: string;
  address: string;
  postalCode?: string;
  landline?: string;
  /** e.g. "شنبه تا چهارشنبه ۹ تا ۱۸، پنجشنبه ۹ تا ۱۳" */
  workingHours?: string;
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
  /** Size of the catalog PDF in bytes, filled in by the server on the public card. */
  catalogSizeBytes?: number;
  layoutDirection?: 'rtl' | 'ltr';
  email: string;
  address: string;
  postalCode?: string;
  /** From the branch. */
  workingHours?: string;
  /** From the organisation (same for every card). */
  gallery?: string[];
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
  /** Admin only: serial number printed on / read from the physical NFC tag. */
  nfcTagSerial?: string;
  /** Admin only: where the printed card is. */
  physicalCard?: PhysicalCardStatus;
  /** Admin only: which inherited fields this card overrides. */
  overrides?: string[];
  createdAt?: string;
  updatedAt?: string;
}

