import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANALYSIS_DATABASE_NAME,
  ANALYSIS_DIRECTORY_NAME,
  DiaryAnalysisStore,
  analyzeDiaryContent,
  cleanMarkdownForAnalysis,
  extractDiaryLocation
} from '../electron/analysis-store.mjs';
import { AnalysisService } from '../electron/analysis-service.mjs';
import { DiaryLocationStore } from '../electron/location-store.mjs';

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('cleans Markdown for analysis without changing or indexing frontmatter', () => {
  const original = `---\n时间: 2026-08-05 09:30\n私密分类: 不应进入词频\n---\n\n# 项目记录\n项目进展顺利。\n\n[参考链接](https://example.com) \`npm test\``;
  const cleaned = cleanMarkdownForAnalysis(original);
  const analysis = analyzeDiaryContent(original);

  assert.doesNotMatch(cleaned, /时间|私密分类|不应进入词频|example|npm test/);
  assert.match(cleaned, /项目记录/);
  assert.equal(analysis.termCounts.get('项目'), 2);
  assert.equal(analyzeDiaryContent('项目复盘与阅读。').termCounts.get('复盘'), 1);
  assert.equal(extractDiaryLocation('---\n地点: 天安门广场\n---\n正文'), '天安门广场');
  assert.equal(extractDiaryLocation('---\n地点: "上海 图书馆"\n---\n正文'), '上海 图书馆');
  assert.equal(extractDiaryLocation('---\n地点: 不应读取\n--- 不是结束标记\n正文'), '');
  assert.equal(extractDiaryLocation('没有 Frontmatter 的正文'), '');
});

test('reports frontmatter locations and enriches confirmed coordinates from the location database', async () => {
  const temporary = await mkdtemp(join(workspaceRoot, '.analysis-location-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const analysisStore = new DiaryAnalysisStore(diaryRoot);
  let locationStore;
  try {
    await mkdir(join(diaryRoot, '2026'), { recursive: true });
    const entries = [
      ['2026-08-01', '天安门广场', '北京散步。'],
      ['2026-08-02', '天安门广场', '再次散步。'],
      ['2026-08-03', '上海图书馆', '阅读。'],
      ['2026-08-04', '', '在家休息。']
    ];
    for (const [date, place, body] of entries) {
      await writeFile(
        join(diaryRoot, '2026', `${date}.md`),
        `---\n时间: ${date} 12:00\n地点:${place ? ` ${place}` : ''}\n---\n\n${body}`,
        'utf8'
      );
    }
    locationStore = new DiaryLocationStore(diaryRoot);
    locationStore.save('2026-08-01', {
      provider: 'amap', poiId: 'beijing-1', displayName: '天安门广场', address: '东长安街',
      district: '北京市东城区', adcode: '110101', longitude: 116.397, latitude: 39.908,
      coordinateSystem: 'gcj02'
    });
    locationStore.save('2026-08-02', {
      provider: 'amap', poiId: 'beijing-1', displayName: '天安门广场', address: '东长安街',
      district: '北京市东城区', adcode: '110101', longitude: 116.397, latitude: 39.908,
      coordinateSystem: 'gcj02'
    });
    locationStore.save('2026-08-03', {
      provider: 'amap', poiId: 'shanghai-1', displayName: '上海图书馆', address: '淮海中路',
      district: '上海市徐汇区', adcode: '310104', longitude: 121.443, latitude: 31.211,
      coordinateSystem: 'gcj02'
    });
    locationStore.save('2026-08-04', {
      provider: 'amap', poiId: 'stale-1', displayName: '旧地点', address: '已经从日记中移除',
      district: '旧行政区', adcode: '', longitude: 120, latitude: 30,
      coordinateSystem: 'gcj02'
    });
    locationStore.close();
    locationStore = null;

    await analysisStore.synchronize();
    const insights = await analysisStore.insights();
    assert.deepEqual(insights.locations.summary, {
      locationEntryCount: 3,
      uniqueLocationCount: 2,
      geocodedEntryCount: 3,
      unresolvedEntryCount: 0,
      mappableEntryCount: 3,
      uniqueCoordinateCount: 2,
      uniqueDistrictCount: 2,
      coverageRate: 0.75,
      geocodedRate: 1
    });
    assert.deepEqual(insights.locations.topLocations[0], {
      name: '天安门广场', entryCount: 2, geocodedEntryCount: 2
    });
    assert.deepEqual(insights.locations.districts[0], { name: '北京市东城区', entryCount: 2 });
    assert.deepEqual(insights.locations.mapPoints[0], {
      name: '天安门广场',
      sourceNames: ['天安门广场'],
      address: '东长安街',
      district: '北京市东城区',
      longitude: 116.397,
      latitude: 39.908,
      coordinateSystem: 'gcj02',
      entryCount: 2,
      firstDate: '2026-08-01',
      lastDate: '2026-08-02'
    });
    assert.equal(insights.locations.coordinateDatabase.available, true);

    const filtered = await analysisStore.insights({ startDate: '2026-08-03', endDate: '2026-08-04' });
    assert.equal(filtered.locations.summary.locationEntryCount, 1);
    assert.equal(filtered.locations.topLocations[0].name, '上海图书馆');
    assert.equal(filtered.locations.mapPoints.length, 1);
  } finally {
    locationStore?.close();
    analysisStore.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('builds and incrementally updates a SQLite analysis index beside the diary', async () => {
  const temporary = await mkdtemp(join(workspaceRoot, '.analysis-store-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const firstPath = join(diaryRoot, '2026', '2026-08-04.md');
  const secondPath = join(diaryRoot, '2026', '2026-08-05.md');
  const firstContent = `---\n时间: 2026-08-04 09:00\n自定义字段: 原样保留\n---\n\n# 工作\n项目 项目 进展顺利。`;
  const secondContent = `---\n时间: 2026-08-05 20:00\n---\n\n# 生活\n阅读之后继续项目。`;
  const store = new DiaryAnalysisStore(diaryRoot);

  try {
    await mkdir(join(diaryRoot, '2026'), { recursive: true });
    await writeFile(firstPath, firstContent, 'utf8');
    await writeFile(secondPath, secondContent, 'utf8');

    const firstSync = await store.synchronize();
    assert.equal(firstSync.total, 2);
    assert.equal(firstSync.changed, 2);
    assert.equal(await readFile(firstPath, 'utf8'), firstContent);
    assert.equal((await stat(join(diaryRoot, ANALYSIS_DIRECTORY_NAME, ANALYSIS_DATABASE_NAME))).isFile(), true);

    const insights = await store.insights();
    assert.equal(insights.summary.entryCount, 2);
    assert.equal(insights.summary.longestStreak, 2);
    assert.equal(insights.monthly[0].month, '2026-08');
    assert.equal(insights.topTerms.find((item) => item.term === '项目')?.count, 3);
    assert.equal(insights.topTerms.some((item) => item.term === '自定义'), false);

    const unchangedSync = await store.synchronize();
    assert.equal(unchangedSync.changed, 0);

    await writeFile(secondPath, `${secondContent}\n项目复盘。`, 'utf8');
    const updatedSync = await store.synchronize();
    assert.equal(updatedSync.changed, 1);
    const filtered = await store.insights({ startDate: '2026-08-05', endDate: '2026-08-05' });
    assert.equal(filtered.summary.entryCount, 1);
    assert.equal(filtered.summary.calendarDays, 1);
    assert.equal(filtered.topTerms.find((item) => item.term === '项目')?.count, 2);

    await unlink(firstPath);
    const removedSync = await store.synchronize();
    assert.equal(removedSync.removed, 1);
    assert.equal((await store.insights()).summary.entryCount, 1);
  } finally {
    store.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('runs SQLite indexing outside the caller thread through the analysis service', async () => {
  const temporary = await mkdtemp(join(workspaceRoot, '.analysis-service-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const progress = [];
  const service = new AnalysisService(diaryRoot, { onProgress: (value) => progress.push(value) });
  try {
    await mkdir(join(diaryRoot, '2025'), { recursive: true });
    await writeFile(join(diaryRoot, '2025', '2025-12-31.md'), '# 年末\n阅读与散步。', 'utf8');
    const result = await service.insights();
    assert.equal(result.summary.entryCount, 1);
    assert.equal(result.topTerms.some((item) => item.term === '阅读'), true);
    assert.equal(progress.at(-1).completed, 1);
  } finally {
    await service.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('reports only repeated same-day term associations with support and lift', async () => {
  const temporary = await mkdtemp(join(workspaceRoot, '.analysis-pattern-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const store = new DiaryAnalysisStore(diaryRoot);
  try {
    await mkdir(join(diaryRoot, '2026'), { recursive: true });
    for (let day = 1; day <= 10; day += 1) {
      const date = `2026-07-${String(day).padStart(2, '0')}`;
      const body = day <= 6 ? '运动 睡眠' : '工作 阅读';
      await writeFile(join(diaryRoot, '2026', `${date}.md`), body, 'utf8');
    }
    await store.synchronize();
    const insights = await store.insights();
    const pair = insights.associations.find((item) => (
      new Set([item.left, item.right]).has('运动') && new Set([item.left, item.right]).has('睡眠')
    ));
    assert.equal(pair?.supportDays, 6);
    assert.ok(pair.lift > 1.2);
  } finally {
    store.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
