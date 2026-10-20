import { EmployeeProfile } from '../types';
import { DEFAULT_COORDINATES, buildMapUrls } from '../utils/location';

/**
 * Standard Default Profiles for Roya Interior Design
 * Seeded on first installation or database reset.
 */
export const INITIAL_PROFILES: EmployeeProfile[] = [
  {
    id: 'amir-tajik',
    slug: 'tajik',
    name: 'امیر تاجیک',
    nameEn: 'Amir Tajik',
    title: 'مدیر فروش و بازاریابی',
    titleEn: 'Sales & Marketing Manager',
    company: 'شرکت رویا طرح داخلی',
    companyEn: 'ROYA Surface Center',
    slogan: 'Dream | Design | Deliver',
    mobile: '0912 075 3287',
    whatsapp: '0912 075 3287',
    landline: '021 2599 1425',
    instagram: 'Royco',
    instagramUrl: 'https://www.instagram.com/royaco',
    website: 'www.royaco.com',
    websiteUrl: 'https://www.royaco.com',
    catalogUrl: 'catalog.royaco.com',
    catalogPdfUrl: '/roya-catalog.pdf',
    layoutDirection: 'rtl',
    email: 'a.tajik@royaco.com',
    address: 'تهران، خیابان شریعتی، نبش خیابان دولت، برج نگین قلهک، طبقه اول، واحد 11',
    postalCode: '1939613111',
    department: 'فروش و پروژه‌ها',
    avatarGender: 'male',
    bio: 'کارت ویزیت دیجیتال هوشمند رویا طرح داخلی (ROYA Surface Center)',
    mapLocation: {
      lat: DEFAULT_COORDINATES.lat,
      lng: DEFAULT_COORDINATES.lng,
      title: DEFAULT_COORDINATES.title,
      ...buildMapUrls(DEFAULT_COORDINATES.lat, DEFAULT_COORDINATES.lng),
    },
    analytics: {
      views: 0,
      nfcTaps: 0,
      qrScans: 0,
      callClicks: 0,
      whatsappClicks: 0,
      catalogDownloads: 0,
      vcardDownloads: 0,
      mapClicks: 0,
    },
  },
];
