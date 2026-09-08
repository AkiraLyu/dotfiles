import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AmapLocationService,
  buildAmapMarkerUrl,
  buildAmapStaticMapUrl,
  normalizeAmapApiKey,
  normalizeAmapTip,
  parseAmapLocation
} from '../electron/location-service.mjs';

test('AMap location values and tips are normalized defensively', () => {
  assert.deepEqual(parseAmapLocation('116.397,39.908'), { longitude: 116.397, latitude: 39.908 });
  assert.equal(parseAmapLocation('181,39'), null);
  assert.equal(parseAmapLocation([]), null);
  assert.deepEqual(normalizeAmapTip({
    id: 'B000A',
    name: ' 天安门\n广场 ',
    district: '北京市东城区',
    address: '东长安街',
    adcode: '110101',
    location: '116.397,39.908'
  }), {
    provider: 'amap',
    poiId: 'B000A',
    displayName: '天安门 广场',
    address: '东长安街',
    district: '北京市东城区',
    adcode: '110101',
    longitude: 116.397,
    latitude: 39.908,
    coordinateSystem: 'gcj02'
  });
  assert.throws(() => normalizeAmapApiKey('short'), /格式无效/);
});

test('AMap input tips search sends bounded parameters and returns unique coordinate candidates', async () => {
  let requestedUrl;
  const service = new AmapLocationService({
    keyProvider: () => 'validKey_123',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            status: '1',
            tips: [
              { id: 'one', name: '上海图书馆', district: '上海市徐汇区', address: '淮海中路', adcode: '310104', location: '121.443,31.211' },
              { id: 'one', name: '重复项', district: '上海市', location: '121.443,31.211' },
              { id: 'missing', name: '没有坐标' },
              { id: 'two', name: '上海图书馆东馆', district: '上海市浦东新区', adcode: '310115', location: '121.589,31.222' }
            ]
          };
        }
      };
    }
  });

  const results = await service.search(' 上海图书馆 ', { city: '310104' });
  assert.equal(requestedUrl.origin, 'https://restapi.amap.com');
  assert.equal(requestedUrl.pathname, '/v3/assistant/inputtips');
  assert.equal(requestedUrl.searchParams.get('key'), 'validKey_123');
  assert.equal(requestedUrl.searchParams.get('keywords'), '上海图书馆');
  assert.equal(requestedUrl.searchParams.get('datatype'), 'poi');
  assert.equal(requestedUrl.searchParams.get('city'), '310104');
  assert.equal(requestedUrl.searchParams.get('citylimit'), 'false');
  assert.deepEqual(results.map((item) => item.poiId), ['one', 'two']);

  await service.search('上海图书馆', { city: '310104', cityLimit: true });
  assert.equal(requestedUrl.searchParams.get('citylimit'), 'true');
});

test('AMap search handles short queries, missing keys, and service errors', async () => {
  let calls = 0;
  const noKey = new AmapLocationService({
    keyProvider: () => '',
    fetchImpl: async () => { calls += 1; }
  });
  assert.deepEqual(await noKey.search('北'), []);
  assert.equal(calls, 0);
  await assert.rejects(noKey.search('北京'), /配置高德 Web 服务 Key/);

  const rejected = new AmapLocationService({
    keyProvider: () => 'validKey_123',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: '0', info: 'INVALID_USER_KEY' })
    })
  });
  await assert.rejects(rejected.search('北京'), /INVALID_USER_KEY/);
});

test('AMap marker URI carries GCJ-02 coordinates and a safe display name', () => {
  const url = new URL(buildAmapMarkerUrl({
    displayName: '天安门\n广场',
    longitude: 116.397,
    latitude: 39.908,
    coordinateSystem: 'gcj02'
  }));
  assert.equal(url.origin, 'https://uri.amap.com');
  assert.equal(url.pathname, '/marker');
  assert.equal(url.searchParams.get('position'), '116.397,39.908');
  assert.equal(url.searchParams.get('name'), '天安门 广场');
  assert.equal(url.searchParams.get('coordinate'), 'gaode');
  assert.equal(url.searchParams.get('src'), 'shiguang-diary');
});

test('AMap static maps use bounded Web Service parameters and labelled GCJ-02 markers', () => {
  const points = [
    { longitude: 116.39712345, latitude: 39.90812345, coordinateSystem: 'gcj02' },
    { longitude: 121.443, latitude: 31.211, coordinateSystem: 'gcj02' }
  ];
  const url = buildAmapStaticMapUrl(points, 'validKey_123', { width: 800, height: 600, scale: 2 });
  assert.equal(url.origin, 'https://restapi.amap.com');
  assert.equal(url.pathname, '/v3/staticmap');
  assert.equal(url.searchParams.get('size'), '800*600');
  assert.equal(url.searchParams.get('scale'), '2');
  const markers = url.searchParams.get('markers').split('|').map((marker) => {
    const [style, position] = marker.split(':');
    return { label: style.split(',').at(-1), coordinates: position.split(',').map(Number) };
  });
  assert.deepEqual(markers.map((marker) => marker.label), ['A', 'B']);
  for (const [index, marker] of markers.entries()) {
    assert.ok(Math.abs(marker.coordinates[0] - points[index].longitude) < 0.000001);
    assert.ok(Math.abs(marker.coordinates[1] - points[index].latitude) < 0.000001);
  }

  const single = buildAmapStaticMapUrl(points.slice(0, 1), 'validKey_123');
  assert.equal(single.searchParams.get('location'), '116.397123,39.908123');
  assert.throws(() => buildAmapStaticMapUrl(Array(11).fill(points[0]), 'validKey_123'), /最多显示 10/);
  assert.throws(() => buildAmapStaticMapUrl([{ ...points[0], coordinateSystem: 'wgs84' }], 'validKey_123'), /GCJ-02/);
});

test('AMap static map image responses are fetched without exposing response errors', async () => {
  let requestedUrl;
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const service = new AmapLocationService({
    keyProvider: () => 'validKey_123',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/png', 'content-length': String(png.length) }),
        arrayBuffer: async () => png.buffer
      };
    }
  });
  const result = await service.staticMap([
    { longitude: 116.397, latitude: 39.908, coordinateSystem: 'gcj02' }
  ]);
  assert.equal(requestedUrl.searchParams.get('key'), 'validKey_123');
  assert.equal(result.contentType, 'image/png');
  assert.deepEqual([...result.bytes], [...png]);
  assert.equal(result.pointCount, 1);

  const rejected = new AmapLocationService({
    keyProvider: () => 'validKey_123',
    fetchImpl: async () => {
      const body = new TextEncoder().encode(JSON.stringify({ status: '0', info: 'INVALID_USER_KEY' }));
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        arrayBuffer: async () => body.buffer
      };
    }
  });
  await assert.rejects(rejected.staticMap([
    { longitude: 116.397, latitude: 39.908, coordinateSystem: 'gcj02' }
  ]), /INVALID_USER_KEY/);
});
