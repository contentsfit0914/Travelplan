// 팀 공용 배포용 설정. 키를 여기에 넣으면 앱 설정 화면에서 따로 입력하지 않아도 된다.
// ⚠ 공개 저장소에 키를 커밋하지 말 것. 넣는다면 Google Cloud 콘솔에서 반드시 HTTP 리퍼러(배포 도메인)로 제한한다.
window.TRAVELPLAN_CONFIG = {
  googleMapsApiKey: '',
  // Advanced Marker용 지도 ID. 비워 두면 Google 테스트용 'DEMO_MAP_ID'를 쓴다.
  mapId: '',
};
