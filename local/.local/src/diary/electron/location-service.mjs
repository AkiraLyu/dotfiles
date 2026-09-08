const AMAP_INPUT_TIPS_URL = 'https://restapi.amap.com/v3/assistant/inputtips';
const AMAP_STATIC_MAP_URL = 'https://restapi.amap.com/v3/staticmap';
const AMAP_MARKER_URL = 'https://uri.amap.com/marker';
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 12;
const MAX_STATIC_MAP_POINTS = 10;
const MAX_STATIC_MAP_BYTES = 8 * 1024 * 1024;
const STATIC_MAP_LABELS = 'ABCDEFGHIJ';

function stringField(value, maximum = 400) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [...normalized].slice(0, maximum).join('');
}

export function normalizeAmapApiKey(value) {
  const key = stringField(value, 128);
  if (!key) throw new Error('请先在设置中配置高德 Web 服务 Key');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error('高德 Web 服务 Key 格式无效');
  return key;
}

export function normalizeLocationQuery(value) {
  return stringField(String(value || '').normalize('NFKC'), MAX_QUERY_LENGTH);
}

export function parseAmapLocation(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  const [longitude, latitude] = parts;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return { longitude, latitude };
}

export function normalizeAmapTip(value) {
  if (!value || typeof value !== 'object') return null;
  const displayName = stringField(value.name, 160);
  const coordinates = parseAmapLocation(value.location);
  if (!displayName || !coordinates) return null;
  return {
    provider: 'amap',
    poiId: stringField(value.id, 128),
    displayName,
    address: stringField(value.address),
    district: stringField(value.district, 200),
    adcode: /^\d{6}$/.test(stringField(value.adcode, 12)) ? stringField(value.adcode, 12) : '',
    ...coordinates,
    coordinateSystem: 'gcj02'
  };
}

function uniqueCandidates(tips) {
  const seen = new Set();
  const candidates = [];
  for (const tip of Array.isArray(tips) ? tips : []) {
    const candidate = normalizeAmapTip(tip);
    if (!candidate) continue;
    const identity = candidate.poiId || `${candidate.displayName}\0${candidate.longitude}\0${candidate.latitude}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    candidates.push(candidate);
    if (candidates.length >= MAX_RESULTS) break;
  }
  return candidates;
}

export function buildAmapMarkerUrl(location) {
  const longitude = Number(location?.longitude);
  const latitude = Number(location?.latitude);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('地点经度无效');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('地点纬度无效');
  const coordinateSystem = location?.coordinateSystem === 'wgs84' ? 'wgs84' : 'gaode';
  const url = new URL(AMAP_MARKER_URL);
  url.searchParams.set('position', `${longitude},${latitude}`);
  url.searchParams.set('name', stringField(location?.displayName, 160) || '日记地点');
  url.searchParams.set('coordinate', coordinateSystem);
  url.searchParams.set('src', 'shiguang-diary');
  return url.toString();
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

function staticMapPoint(value) {
  const longitude = Number(value?.longitude);
  const latitude = Number(value?.latitude);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('地图点经度无效');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('地图点纬度无效');
  if ((value?.coordinateSystem || 'gcj02') !== 'gcj02') throw new Error('静态地图仅支持 GCJ-02 坐标');
  const format = (coordinate) => String(Number(coordinate.toFixed(6)));
  return `${format(longitude)},${format(latitude)}`;
}

export function buildAmapStaticMapUrl(points, key, { width = 1024, height = 680, scale = 1 } = {}) {
  if (!Array.isArray(points) || !points.length) throw new Error('没有可显示的地图坐标');
  if (points.length > MAX_STATIC_MAP_POINTS) throw new Error(`每张地图最多显示 ${MAX_STATIC_MAP_POINTS} 个地点`);
  const locations = points.map(staticMapPoint);
  const url = new URL(AMAP_STATIC_MAP_URL);
  url.searchParams.set('size', `${boundedInteger(width, 1024, 320, 1024)}*${boundedInteger(height, 680, 240, 1024)}`);
  url.searchParams.set('scale', String(boundedInteger(scale, 1, 1, 2)));
  url.searchParams.set('traffic', '0');
  url.searchParams.set('markers', locations.map((location, index) => (
    `mid,0x6750A4,${STATIC_MAP_LABELS[index]}:${location}`
  )).join('|'));
  if (locations.length === 1) {
    url.searchParams.set('location', locations[0]);
    url.searchParams.set('zoom', '14');
  }
  url.searchParams.set('key', normalizeAmapApiKey(key));
  return url;
}

function amapErrorDetail(bytes) {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return stringField(value?.info || value?.infocode, 120);
  } catch {
    return '';
  }
}

export class AmapLocationService {
  constructor({ fetchImpl, keyProvider, timeoutMs = 8000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');
    if (typeof keyProvider !== 'function') throw new TypeError('keyProvider is required');
    this.fetchImpl = fetchImpl;
    this.keyProvider = keyProvider;
    this.timeoutMs = timeoutMs;
  }

  async search(value, { city = '', cityLimit = false, signal } = {}) {
    const query = normalizeLocationQuery(value);
    if ([...query].length < 2) return [];
    const key = normalizeAmapApiKey(await this.keyProvider());
    const url = new URL(AMAP_INPUT_TIPS_URL);
    url.searchParams.set('key', key);
    url.searchParams.set('keywords', query);
    url.searchParams.set('datatype', 'poi');
    url.searchParams.set('output', 'json');
    if (/^\d{6}$/.test(String(city || ''))) {
      url.searchParams.set('city', String(city));
      url.searchParams.set('citylimit', cityLimit ? 'true' : 'false');
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      response = await this.fetchImpl(url, {
        signal: requestSignal,
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      if (requestSignal.aborted) throw new Error('地点搜索已取消或超时');
      throw new Error(`无法连接高德地点服务：${error.message}`);
    }
    if (!response.ok) throw new Error(`高德地点服务请求失败 (${response.status})`);

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('高德地点服务返回了无效数据');
    }
    if (String(result?.status) !== '1') {
      const detail = stringField(result?.info, 120);
      throw new Error(detail && detail !== 'OK' ? `高德地点搜索失败：${detail}` : '高德地点搜索失败');
    }
    return uniqueCandidates(result.tips);
  }

  async staticMap(points, { width = 1024, height = 680, scale = 1, signal } = {}) {
    const key = normalizeAmapApiKey(await this.keyProvider());
    const url = buildAmapStaticMapUrl(points, key, { width, height, scale });
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      response = await this.fetchImpl(url, {
        signal: requestSignal,
        headers: { Accept: 'image/png,image/jpeg' }
      });
    } catch (error) {
      if (requestSignal.aborted) throw new Error('地图生成已取消或超时');
      throw new Error(`无法连接高德静态地图服务：${error.message}`);
    }
    const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    const declaredSize = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_STATIC_MAP_BYTES) throw new Error('高德静态地图响应过大');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || !contentType.startsWith('image/')) {
      const detail = amapErrorDetail(bytes);
      throw new Error(detail && detail !== 'OK'
        ? `高德静态地图生成失败：${detail}`
        : `高德静态地图请求失败 (${response.status})`);
    }
    if (!bytes.length || bytes.length > MAX_STATIC_MAP_BYTES) throw new Error('高德静态地图响应无效');
    return {
      bytes,
      contentType,
      width: boundedInteger(width, 1024, 320, 1024),
      height: boundedInteger(height, 680, 240, 1024),
      pointCount: points.length
    };
  }
}
