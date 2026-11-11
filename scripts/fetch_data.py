"""Download and validate NBS monthly housing indices. Never interpolate missing data."""
import argparse
import concurrent.futures as cf
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'raw'
DATA = ROOT / 'data'
BASE = 'https://www.stats.gov.cn/sj/zxfb/'


def download(url):
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=(10, 25))
            r.raise_for_status()
            return r.content.decode('utf-8-sig')
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)


def discover(page):
    url = BASE + (f'index_{page}.html' if page else 'index.html')
    html = download(url)
    soup = BeautifulSoup(html, 'html.parser')
    found = {}
    for a in soup.select('a[href]'):
        title = a.get('title') or a.get_text(strip=True)
        m = re.fullmatch(r'(20\d{2})年(\d{1,2})月份70个大中城市商品住宅销售价格变动情况', title)
        if m:
            month = f'{m[1]}-{int(m[2]):02d}'
            if month >= '2024-01':
                found[month] = urljoin(url, a['href'])
    return found


def clean(text):
    return re.sub(r'\s+', '', text)


def number(text):
    text = clean(text)
    if text in ('', '-', '—', '…', '...', 'NA', 'N/A'):
        return None
    return float(text)


def parse_month(html, month, url):
    soup = BeautifulSoup(html, 'html.parser')
    records = []
    # Table 1 and 2 are the aggregate indices. January has 3 columns per
    # city, other months 4; match groups by city name rather than offsets.
    tables = []
    for table in soup.select('table'):
        if table.find_parent('table'):
            continue
        rows = []
        for tr in table.select('tr'):
            cells = [clean(c.get_text()) for c in tr.find_all(['td', 'th'], recursive=False)]
            if cells:
                rows.append(cells)
        city_rows = [r for r in rows if r and r[0] == '北京']
        if city_rows and len(city_rows[0]) in (6, 8, 10):
            tables.append(rows)
    if len(tables) < 2:
        raise ValueError(f'{month}: cannot identify aggregate tables ({len(tables)})')
    for housing_type, rows in zip(('new', 'resale'), tables[:2]):
        for cells in rows:
            if len(cells) not in (6, 8, 10):
                continue
            half = len(cells) // 2
            for group in (cells[:half], cells[half:]):
                if not re.fullmatch(r'[\u4e00-\u9fff]{2,5}', group[0]) or group[0] == '城市':
                    continue
                try:
                    mom, yoy = number(group[1]), number(group[2])
                except ValueError:
                    continue
                records.append(dict(month=month, city=group[0], type=housing_type,
                                    mom_index=mom, yoy_index=yoy, source=url))
    assert len(records) == 140, (month, len(records))
    return records, soup.get_text(' ', strip=True)


def process(source):
    month, url = source
    path = RAW / f'{month}.html'
    if not path.exists():
        path.write_bytes(download(url).encode('utf-8'))
    html = path.read_text(encoding='utf-8')
    records, text = parse_month(html, month, url)
    note = re.search(r'按照统计制度规定.{0,250}', text)
    print(f'{month}: {len(records)} records', flush=True)
    return records, dict(month=month, url=url, snapshot=f'raw/{month}.html',
                         sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                         methodology_note=note[0] if note else None)


def validate(records):
    keys = [(r['month'], r['city'], r['type']) for r in records]
    assert len(keys) == len(set(keys)), 'duplicate key'
    months = sorted({r['month'] for r in records})
    cities = [r['city'] for r in records if r['month'] == months[0] and r['type'] == 'new']
    assert len(set(cities)) == 70
    for m in months:
        for t in ('new', 'resale'):
            rows = [r for r in records if r['month'] == m and r['type'] == t]
            assert len(rows) == 70 and {r['city'] for r in rows} == set(cities), (m, t)
    for a, b in zip(months, months[1:]):
        ay, am = map(int, a.split('-'))
        by, bm = map(int, b.split('-'))
        assert by * 12 + bm == ay * 12 + am + 1, (a, b)
    missing = sum(r[k] is None for r in records for k in ('mom_index', 'yoy_index'))
    assert all(r[k] is None or 50 < r[k] < 150 for r in records for k in ('mom_index', 'yoy_index'))
    return dict(months=months, cities=cities, count=len(records), missing_values=missing,
                duplicate_keys=0, expected_count=len(months) * 140)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--discover', action='store_true', help='Refresh official release list before processing')
    parser.add_argument('--pages', type=int, default=48)
    parser.add_argument('--check-latest', action='store_true', help='Recheck newest official release without rebuilding data')
    args = parser.parse_args()
    RAW.mkdir(exist_ok=True)
    DATA.mkdir(exist_ok=True)
    source_path = DATA / 'source_urls.json'
    sources = json.loads(source_path.read_text(encoding='utf-8')) if source_path.exists() else {}
    if args.check_latest:
        found = {}
        with cf.ThreadPoolExecutor(max_workers=3) as pool:
            for result in pool.map(discover, range(3)):
                found.update(result)
        assert found, 'No recent official release found'
        latest = max(found)
        check = dict(checked_at=datetime.now(timezone.utc).isoformat(), latest_official_month=latest,
                     latest_local_month=max(sources) if sources else None,
                     recent_sources=dict(sorted(found.items())))
        (DATA / 'latest-release-check.json').write_text(json.dumps(check, ensure_ascii=False, indent=2), encoding='utf-8', newline='')
        assert latest == max(sources), 'New official data available: rerun with --discover'
        metadata_path = DATA / 'metadata.json'
        if metadata_path.exists():
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
            metadata['release_checked_at'] = check['checked_at']
            metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8', newline='')
        print(json.dumps(check, ensure_ascii=False), flush=True)
        return
    if args.discover or not sources:
        with cf.ThreadPoolExecutor(max_workers=6) as pool:
            for found in pool.map(discover, range(args.pages)):
                sources.update(found)
        source_path.write_text(json.dumps(dict(sorted(sources.items())), ensure_ascii=False, indent=2), encoding='utf-8', newline='')
        print(f'Discovered {len(sources)} months', flush=True)
    assert sources, 'No official releases found'
    rows, provenance = [], []
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for records, source in pool.map(process, sorted(sources.items())):
            rows.extend(records)
            provenance.append(source)
    checks = validate(rows)
    timestamp = datetime.now(timezone.utc).isoformat()
    metadata = {**checks, 'checked_at': timestamp, 'latest_month': checks['months'][-1],
                'baseline_change': '2026年1月起，使用2025年作为新一轮对比基期，各城市基本分类权数有所调整。仅展示官方环比和同比，不拼接定基指数。'}
    for name, obj in [('housing.json', rows), ('metadata.json', metadata), ('sources.json', provenance), ('validation.json', checks)]:
        (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8', newline='')
    print(json.dumps({k:v for k,v in checks.items() if k not in ('cities','months')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
