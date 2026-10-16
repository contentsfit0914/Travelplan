// 거리·이동시간 추정 유틸. Google 경로 응답이 오기 전/실패 시 쓰는 근사치다.

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function distKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const MODES = {
  WALK: { label: '도보', icon: '🚶', gmaps: 'walking' },
  TRANSIT: { label: '대중교통', icon: '🚇', gmaps: 'transit' },
  DRIVE: { label: '택시', icon: '🚕', gmaps: 'driving' },
};

// 직선거리 × 도로 우회계수로 근사. 도쿄 시내 평균값 기준의 보수적 추정이다.
export function estimateMinutes(a, b, mode) {
  const km = distKm(a, b) * 1.3;
  if (mode === 'WALK') return Math.max(1, Math.round((km / 4.5) * 60));
  if (mode === 'DRIVE') return Math.max(5, Math.round(4 + (km / 18) * 60));
  // 대중교통: 역까지 도보 + 대기 + 환승을 고정 12분으로 가정
  return Math.max(8, Math.round(12 + (km / 22) * 60));
}

// 이동수단 '자동'일 때: 도보 허용 거리 안이면 걷고, 아니면 기본 수단
export function resolveMode(a, b, pref, walkLimitKm = 1, baseMode = 'TRANSIT') {
  if (pref && pref !== 'AUTO') return pref;
  return distKm(a, b) <= walkLimitKm ? 'WALK' : baseMode;
}

export function centroid(points) {
  const n = points.length || 1;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lng: points.reduce((s, p) => s + p.lng, 0) / n,
  };
}

export function fmtKm(km) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
