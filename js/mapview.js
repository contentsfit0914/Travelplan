// 지도 어댑터: Google 지도(키가 있을 때) / Leaflet(데모 모드)을 같은 인터페이스로 다룬다.

const TOKYO = { lat: 35.6812, lng: 139.7671 };

function pinElement(m) {
  const el = document.createElement('div');
  el.className = `pin pin-${m.style || 'stop'}${m.active ? ' is-active' : ''}`;
  if (m.color) el.style.setProperty('--c', m.color);
  el.innerHTML = `<span>${m.label ?? ''}</span>`;
  if (m.title) el.title = m.title;
  return el;
}

export class MapView {
  constructor(el) {
    this.el = el;
    this.kind = null;
    this.map = null;
    this.layers = [];
    this.avatar = null; // 내 캐릭터 마커(draw()로 지워지지 않는다)
  }

  async use(kind, { mapId, tiles = true } = {}) {
    if (this.kind === kind && this.map) return;
    this.destroy();
    this.kind = kind;
    if (kind === 'google') {
      const { Map } = await google.maps.importLibrary('maps');
      const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
      this.AME = AdvancedMarkerElement;
      this.map = new Map(this.el, {
        center: TOKYO,
        zoom: 12,
        mapId: mapId || 'DEMO_MAP_ID',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
        disableDoubleClickZoom: true, // 더블 탭은 '전체 보기'로 쓴다
      });
      this.map.addListener?.('dblclick', () => this.onDblClick?.());
    } else {
      this.map = window.L.map(this.el, { zoomControl: true, doubleClickZoom: false }).setView([TOKYO.lat, TOKYO.lng], 12);
      this.map.on('dblclick', () => this.onDblClick?.());
      this.el.classList.toggle('no-tiles', !tiles);
      if (tiles) {
        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(this.map);
      }
    }
  }

  destroy() {
    this.clear();
    this.removeAvatar();
    if (this.kind === 'leaflet' && this.map) this.map.remove();
    this.map = null;
    this.kind = null;
    this.el.innerHTML = '';
  }

  clear() {
    for (const l of this.layers) {
      if (this.kind === 'google') {
        if (l.setMap) l.setMap(null);
        else l.map = null;
      } else l.remove();
    }
    this.layers = [];
  }

  // markers: [{lat,lng,label,style,color,title,active,z,onClick}], lines: [{path,color,dashed,weight,opacity}]
  draw({ markers = [], lines = [] }) {
    if (!this.map) return;
    this.clear();
    const L = window.L;
    for (const ln of lines) {
      if (!ln.path || ln.path.length < 2) continue;
      if (this.kind === 'google') {
        const opts = {
          map: this.map,
          path: ln.path,
          strokeColor: ln.color,
          strokeOpacity: ln.opacity ?? 0.9,
          strokeWeight: ln.weight ?? 5,
          zIndex: 1,
        };
        if (ln.dashed) {
          opts.strokeOpacity = 0;
          opts.icons = [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: ln.opacity ?? 0.9, strokeColor: ln.color, scale: 3 },
              offset: '0',
              repeat: '12px',
            },
          ];
        }
        this.layers.push(new google.maps.Polyline(opts));
      } else {
        this.layers.push(
          L.polyline(
            ln.path.map((p) => [p.lat, p.lng]),
            { color: ln.color, weight: ln.weight ?? 5, opacity: ln.opacity ?? 0.9, dashArray: ln.dashed ? '6 9' : null },
          ).addTo(this.map),
        );
      }
    }
    for (const m of markers) {
      const el = pinElement(m);
      if (this.kind === 'google') {
        const mk = new this.AME({
          map: this.map,
          position: { lat: m.lat, lng: m.lng },
          content: el,
          title: m.title || '',
          zIndex: m.z ?? 10,
          gmpClickable: !!m.onClick,
        });
        if (m.onClick) mk.addEventListener('gmp-click', m.onClick);
        this.layers.push(mk);
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'lf-anchor';
        wrap.append(el);
        const mk = L.marker([m.lat, m.lng], {
          icon: L.divIcon({ html: wrap, className: 'lf-icon', iconSize: [0, 0] }),
          zIndexOffset: (m.z ?? 10) * 10,
          title: m.title || '',
        }).addTo(this.map);
        if (m.onClick) mk.on('click', m.onClick);
        this.layers.push(mk);
      }
    }
  }

  // 내 캐릭터: el(아바타 DOM)을 지도 위 좌표에 둔다. 좌표가 없으면 숨긴다
  setAvatar(el, pos, onClick) {
    if (!this.map) return;
    if (!pos) return this.removeAvatar();
    if (this.avatar && this.avatarKind !== this.kind) this.removeAvatar();
    if (!this.avatar) {
      if (this.kind === 'google') {
        const mk = new this.AME({ map: this.map, content: el, position: pos, zIndex: 200, gmpClickable: true });
        mk.addEventListener('gmp-click', () => this.avatarClick?.());
        this.avatar = mk;
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'lf-anchor';
        wrap.append(el);
        const mk = window.L.marker([pos.lat, pos.lng], { icon: window.L.divIcon({ html: wrap, className: 'lf-icon', iconSize: [0, 0] }), zIndexOffset: 2000 }).addTo(this.map);
        mk.on('click', () => this.avatarClick?.());
        this.avatar = mk;
      }
      this.avatarKind = this.kind;
    } else {
      const cur = this.avatarContent();
      if (cur !== el) {
        if (this.kind === 'google') this.avatar.content = el;
        else {
          cur.replaceWith(el);
        }
      }
      this.moveAvatar(pos);
    }
    this.avatarClick = onClick;
  }

  avatarContent() {
    if (!this.avatar) return null;
    return this.kind === 'google' ? this.avatar.content : this.avatar.getElement()?.querySelector('.lf-anchor > *');
  }

  moveAvatar(pos) {
    if (!this.avatar || !pos) return;
    if (this.kind === 'google') this.avatar.position = pos;
    else this.avatar.setLatLng([pos.lat, pos.lng]);
  }

  removeAvatar() {
    if (!this.avatar) return;
    if (this.avatarKind === 'google') this.avatar.map = null;
    else this.avatar.remove();
    this.avatar = null;
  }

  // 지도 화면 안에 있는지(재생 중 캐릭터가 밖으로 나가면 따라간다)
  contains(pos) {
    if (!this.map) return true;
    if (typeof this.map.getBounds !== 'function') return true;
    const b = this.map.getBounds();
    if (!b) return true;
    return this.kind === 'google' ? b.contains(pos) : b.contains([pos.lat, pos.lng]);
  }

  fit(points, maxZoom = 16) {
    if (!this.map || !points.length) return;
    if (this.kind === 'google') {
      if (points.length === 1) {
        this.map.setCenter(points[0]);
        this.map.setZoom(15);
        return;
      }
      const b = new google.maps.LatLngBounds();
      points.forEach((p) => b.extend(p));
      this.map.fitBounds(b, 48);
      google.maps.event.addListenerOnce(this.map, 'idle', () => {
        if (this.map.getZoom() > maxZoom) this.map.setZoom(maxZoom);
      });
    } else {
      if (points.length === 1) this.map.setView([points[0].lat, points[0].lng], 15);
      else
        this.map.fitBounds(
          points.map((p) => [p.lat, p.lng]),
          { padding: [40, 40], maxZoom },
        );
    }
  }

  // zoom: 최소 확대 수준. exact=true 면 그 수준으로 맞춘다(핀을 눌렀을 때 거리 수준으로)
  panTo(p, zoom, exact = false) {
    if (!this.map) return;
    const target = zoom ? (exact ? zoom : Math.max(zoom, this.map.getZoom())) : this.map.getZoom();
    if (this.kind === 'google') {
      this.map.panTo(p);
      if (zoom && this.map.getZoom() !== target) this.map.setZoom(target);
    } else this.map.setView([p.lat, p.lng], target, { animate: true });
  }

  resize() {
    if (this.kind === 'leaflet' && this.map) this.map.invalidateSize();
  }
}
