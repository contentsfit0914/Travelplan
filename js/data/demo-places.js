// 데모 모드 전용 샘플 장소. Google API 키 없이 화면·동선 기능을 체험하기 위한 데이터다.
// 좌표는 근사치이며 평점·리뷰 수·영업시간은 일부러 넣지 않았다(실제 정보는 Google 모드에서 조회).

const P = (id, name, lat, lng, types, area, note = '') => ({
  id: `demo:${id}`,
  name,
  lat,
  lng,
  types,
  address: `${area}, 도쿄`,
  note,
  demo: true,
});

export const DEMO_PLACES = [
  // 숙소 후보(지역 대표 지점)
  P('h-shinjuku', '신주쿠역 인근 숙소', 35.6909, 139.7003, ['lodging'], '신주쿠'),
  P('h-shibuya', '시부야역 인근 숙소', 35.658, 139.7016, ['lodging'], '시부야'),
  P('h-ginza', '긴자 인근 숙소', 35.6717, 139.765, ['lodging'], '긴자'),
  P('h-ueno', '우에노역 인근 숙소', 35.7138, 139.7773, ['lodging'], '우에노'),
  P('h-asakusa', '아사쿠사 인근 숙소', 35.7114, 139.7967, ['lodging'], '아사쿠사'),
  P('h-ikebukuro', '이케부쿠로역 인근 숙소', 35.7295, 139.7109, ['lodging'], '이케부쿠로'),
  P('h-tokyo', '도쿄역 인근 숙소', 35.6812, 139.7671, ['lodging'], '마루노우치'),

  // 관광
  P('shibuya-cross', '시부야 스크램블 교차로', 35.6595, 139.7005, ['tourist_attraction'], '시부야'),
  P('shibuya-sky', '시부야 스카이', 35.6584, 139.7022, ['observation_deck', 'tourist_attraction'], '시부야'),
  P('meiji', '메이지 신궁', 35.6764, 139.6993, ['place_of_worship', 'tourist_attraction'], '하라주쿠'),
  P('takeshita', '다케시타 거리', 35.6716, 139.7031, ['tourist_attraction'], '하라주쿠'),
  P('omotesando', '오모테산도', 35.6654, 139.7121, ['tourist_attraction'], '오모테산도'),
  P('gyoen', '신주쿠 교엔', 35.6852, 139.7101, ['park'], '신주쿠'),
  P('tocho', '도쿄도청 전망대', 35.6896, 139.6917, ['observation_deck', 'tourist_attraction'], '신주쿠'),
  P('sensoji', '센소지', 35.7148, 139.7967, ['place_of_worship', 'tourist_attraction'], '아사쿠사'),
  P('nakamise', '나카미세 거리', 35.7119, 139.7965, ['tourist_attraction'], '아사쿠사'),
  P('skytree', '도쿄 스카이트리', 35.7101, 139.8107, ['observation_deck', 'tourist_attraction'], '오시아게'),
  P('ueno-park', '우에노 공원', 35.7156, 139.7745, ['park'], '우에노'),
  P('tnm', '도쿄 국립박물관', 35.7188, 139.7765, ['museum'], '우에노'),
  P('akiba', '아키하바라 전자상가', 35.6984, 139.7731, ['tourist_attraction'], '아키하바라'),
  P('imperial', '고쿄 히가시 정원', 35.6852, 139.7528, ['park', 'tourist_attraction'], '지요다'),
  P('ginza', '긴자 거리', 35.6717, 139.765, ['tourist_attraction'], '긴자'),
  P('teamlab', '팀랩 플래닛', 35.6491, 139.7898, ['museum', 'tourist_attraction'], '도요스'),
  P('odaiba', '오다이바 해변공원', 35.6298, 139.7745, ['park'], '오다이바'),
  P('gundam', '다이버시티 도쿄 플라자', 35.6251, 139.7756, ['shopping_mall'], '오다이바'),
  P('tower', '도쿄타워', 35.6586, 139.7454, ['observation_deck', 'tourist_attraction'], '시바공원'),
  P('roppongi', '롯폰기 힐즈', 35.6604, 139.7292, ['shopping_mall', 'tourist_attraction'], '롯폰기'),
  P('azabudai', '아자부다이 힐즈', 35.6604, 139.74, ['shopping_mall'], '아자부다이'),
  P('shimokita', '시모키타자와 거리', 35.6616, 139.668, ['tourist_attraction'], '시모키타자와'),
  P('nakameguro', '나카메구로 메구로강', 35.644, 139.6988, ['tourist_attraction'], '나카메구로'),
  P('daikanyama', '다이칸야마 츠타야 서점', 35.6489, 139.6994, ['tourist_attraction'], '다이칸야마'),
  P('kichijoji', '이노카시라 공원', 35.6997, 139.573, ['park'], '기치조지'),
  P('sunshine', '선샤인 시티', 35.7289, 139.7193, ['shopping_mall'], '이케부쿠로'),
  P('yanaka', '야나카 긴자', 35.7276, 139.766, ['tourist_attraction'], '야나카'),

  // 먹거리 골목·시장(개별 식당 대신 지역 단위)
  P('f-omoide', '오모이데 요코초', 35.693, 139.6995, ['restaurant'], '신주쿠', '꼬치·선술집 골목'),
  P('f-goldengai', '골든가이', 35.694, 139.7046, ['bar'], '신주쿠', '소규모 바 밀집 골목'),
  P('f-ameyoko', '아메요코 시장', 35.7101, 139.7745, ['restaurant'], '우에노', '시장 먹거리'),
  P('f-tsukiji', '츠키지 장외시장', 35.6655, 139.7707, ['restaurant'], '츠키지', '해산물·길거리 음식'),
  P('f-tsukishima', '츠키시마 몬자 거리', 35.663, 139.782, ['restaurant'], '츠키시마', '몬자야키 식당가'),
  P('f-ebisu', '에비스 요코초', 35.647, 139.7101, ['restaurant'], '에비스', '실내 포장마차 골목'),
  P('f-shibuyayoko', '시부야 요코초', 35.662, 139.702, ['restaurant'], '시부야', '미야시타 파크 1층 식당가'),
  P('f-asakusa', '아사쿠사 호피 거리', 35.7137, 139.7935, ['restaurant'], '아사쿠사', '노천 이자카야 거리'),
  P('f-ramenst', '도쿄역 라멘 스트리트', 35.6802, 139.7685, ['restaurant'], '도쿄역', '라멘 전문점 모음'),
  P('f-harajuku', '하라주쿠 캣스트리트 식당가', 35.6672, 139.7066, ['restaurant'], '하라주쿠'),
  P('f-ginza6', '긴자 식스 식당가', 35.6697, 139.764, ['restaurant'], '긴자'),
  P('f-akiba', '아키하바라 라멘 골목', 35.6995, 139.7715, ['restaurant'], '아키하바라'),
  P('f-odaiba', '아쿠아시티 오다이바 식당가', 35.6278, 139.7738, ['restaurant'], '오다이바'),
  P('f-ikebukuro', '이케부쿠로 라멘 거리', 35.7305, 139.7145, ['restaurant'], '이케부쿠로'),
  P('f-skytree', '소라마치 식당가', 35.7104, 139.8099, ['restaurant'], '오시아게'),
  P('f-roppongi', '롯폰기 힐즈 식당가', 35.6603, 139.7297, ['restaurant'], '롯폰기'),

  // 카페가 모인 곳
  P('c-kiyosumi', '기요스미시라카와 카페 거리', 35.6805, 139.799, ['cafe'], '기요스미'),
  P('c-nakameguro', '나카메구로 강변 카페', 35.6449, 139.6983, ['cafe'], '나카메구로'),
  P('c-omotesando', '오모테산도 뒷골목 카페', 35.6668, 139.7108, ['cafe'], '오모테산도'),
  P('c-shibuya', '오쿠시부야 카페 거리', 35.668, 139.692, ['cafe'], '도미가야'),
  P('c-shimokita', '시모키타자와 카페 골목', 35.6608, 139.6672, ['cafe'], '시모키타자와'),
  P('c-yanaka', '야나카 고민가 카페', 35.7262, 139.7695, ['cafe'], '야나카'),
  P('c-kuramae', '구라마에 카페 거리', 35.7035, 139.7905, ['cafe'], '구라마에'),
  P('c-ginza', '긴자 디저트 카페', 35.6725, 139.7635, ['cafe'], '긴자'),
  P('c-shinjuku', '신주쿠 3초메 카페', 35.6905, 139.7055, ['cafe'], '신주쿠'),
  P('c-ueno', '우에노 공원 카페', 35.7146, 139.7735, ['cafe'], '우에노'),
  P('c-azabu', '아자부주반 카페', 35.6565, 139.7365, ['cafe'], '아자부주반'),
  P('c-kichijoji', '기치조지 카페 거리', 35.7035, 139.5775, ['cafe'], '기치조지'),
];

// 설정 화면의 '인기 스팟 빠른 추가' 칩. Google 모드에서는 이름으로 검색한다.
export const QUICK_SPOTS = [
  '시부야 스크램블 교차로',
  '센소지',
  '도쿄 스카이트리',
  '메이지 신궁',
  '팀랩 플래닛',
  '츠키지 장외시장',
  '신주쿠 교엔',
  '도쿄타워',
  '시부야 스카이',
  '아키하바라 전자상가',
];
