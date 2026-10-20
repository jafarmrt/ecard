export const DEFAULT_COORDINATES = {
  lat: 35.7757770,
  lng: 51.4368051,
  title: 'شرکت رویا طرح داخلی - برج نگین قلهک',
  address: 'تهران، خیابان شریعتی، نبش خیابان دولت، برج نگین قلهک، طبقه اول، واحد 11',
};

export const LOCATION_PRESETS = [
  {
    name: 'دفتر مرکزی و شوروم رویا (برج نگین قلهک)',
    lat: 35.7757770,
    lng: 51.4368051,
    address: 'تهران، خیابان شریعتی، نبش خیابان دولت، برج نگین قلهک، طبقه اول، واحد 11',
  },
  {
    name: 'شوروم نیاوران (شمال تهران)',
    lat: 35.8152400,
    lng: 51.4682000,
    address: 'تهران، خیابان باهنر (نیاوران)، نبش خیابان مینا',
  },
  {
    name: 'شوروم و انبار غرب (سعادت‌آباد)',
    lat: 35.7824100,
    lng: 51.3732500,
    address: 'تهران، سعادت‌آباد، بلوار سرو غربی',
  },
];

export function buildMapUrls(lat: number, lng: number) {
  const cleanLat = Number(lat) || DEFAULT_COORDINATES.lat;
  const cleanLng = Number(lng) || DEFAULT_COORDINATES.lng;

  return {
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${cleanLat},${cleanLng}`,
    neshanUrl: `https://nshn.ir/?lat=${cleanLat}&lng=${cleanLng}`,
    baladUrl: `https://balad.ir/location?latitude=${cleanLat}&longitude=${cleanLng}`,
    wazeUrl: `https://waze.com/ul?ll=${cleanLat},${cleanLng}&navigate=yes`,
  };
}

export function formatCoordinateDMS(lat: number, lng: number): string {
  const toDms = (val: number, isLat: boolean) => {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
    return `${deg}°${min}'${sec}"${dir}`;
  };

  return `${toDms(lat, true)} ${toDms(lng, false)}`;
}
