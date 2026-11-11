"""Descriptive panel analysis. All rates use integer tenths of a percentage point.

No prices are inferred and monthly growth rates are never added together.
Run: python scripts/analyze_dynamics.py [--figures]
"""
import argparse
import hashlib
import json
import math
import statistics as stats
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis'


def ranks(values):
    """Average ranks for ties, equivalent to Spearman's standard tie convention."""
    ordered = sorted(range(len(values)), key=values.__getitem__)
    result = [0.0] * len(values)
    i = 0
    while i < len(values):
        j = i + 1
        while j < len(values) and values[ordered[j]] == values[ordered[i]]:
            j += 1
        for index in ordered[i:j]:
            result[index] = (i + 1 + j) / 2
        i = j
    return result


def spearman(a, b):
    if len(set(a)) < 2 or len(set(b)) < 2:
        return None
    return stats.correlation(ranks(a), ranks(b))


def analyze(rows):
    months = sorted({r['month'] for r in rows})
    cities = list(dict.fromkeys(r['city'] for r in rows))
    index = {(r['month'], r['city'], r['type']): r for r in rows}
    assert len(index) == len(rows) == len(months) * len(cities) * 2
    latest = months[-1]

    def rate(month, city, kind, metric='mom'):
        value = index[month, city, kind][metric + '_index']
        return None if value is None else round(value * 10) - 1000

    result = dict(months=months, cities=cities, latest=latest, rate_storage_unit='0.1 percentage point',
                  recovery={}, runs={}, reversals={}, convergence={}, rank_stability=[], consistency_diagnostic={})
    for kind in ('new', 'resale'):
        recovery = []
        for i in range(1, len(months)):
            matrix = {y: {m: [] for m in ('up', 'flat', 'down')} for y in ('improving', 'unchanged', 'worsening')}
            missing = []
            for c in cities:
                before, now, mom = rate(months[i-1], c, kind, 'yoy'), rate(months[i], c, kind, 'yoy'), rate(months[i], c, kind)
                if None in (before, now, mom):
                    missing.append(c)
                    continue
                y = 'improving' if now > before else 'worsening' if now < before else 'unchanged'
                m = 'up' if mom > 0 else 'down' if mom < 0 else 'flat'
                matrix[y][m].append(c)
            assert sum(len(cs) for row in matrix.values() for cs in row.values()) + len(missing) == len(cities)
            recovery.append(dict(month=months[i], matrix=matrix, missing=missing))
        result['recovery'][kind] = recovery
        runs = []
        for window in (1, 3, 6):
            if len(months) < window:
                continue
            ms = months[-window:]
            valid = [c for c in cities if all(rate(m, c, kind) is not None for m in ms)]
            positive = [c for c in valid if all(rate(m, c, kind) > 0 for m in ms)]
            nonnegative = [c for c in valid if all(rate(m, c, kind) >= 0 for m in ms)]
            negative = [c for c in valid if all(rate(m, c, kind) < 0 for m in ms)]
            assert set(positive) <= set(nonnegative)
            runs.append(dict(window=window, start=ms[0], end=ms[-1], positive=positive, nonnegative=nonnegative, negative=negative, valid=len(valid)))
        result['runs'][kind] = runs
        events = []
        # An event is a city-month; future status requires two complete later months.
        # Late events are censored rather than labelled failures.
        for i in range(1, len(months)-2):
            for c in cities:
                vs = [rate(months[j], c, kind) for j in range(i-1, i+3)]
                if None not in vs and vs[0] < 0 < vs[1]:
                    events.append(dict(city=c, month=months[i], forward_months=months[i+1:i+3],
                                       three_positive=all(v > 0 for v in vs[1:]),
                                       no_negative_followup=all(v >= 0 for v in vs[2:]),
                                       rates_tenths=vs))
        result['reversals'][kind] = dict(events=events, count=len(events),
            three_positive=sum(e['three_positive'] for e in events),
            no_negative_followup=sum(e['no_negative_followup'] for e in events),
            cities=len({e['city'] for e in events}), last_eligible_month=months[-3])
    start = latest[:4] + '-01'
    if start in months and start != latest:
        comparison = []
        for c in cities:
            a = [rate(start, c, t, 'yoy') for t in ('new', 'resale')]
            b = [rate(latest, c, t, 'yoy') for t in ('new', 'resale')]
            if None in a+b:
                continue
            dn, dr = b[0]-a[0], b[1]-a[1]
            absolute_change = abs(b[0]-b[1])-abs(a[0]-a[1])
            direction = 'narrower' if absolute_change < 0 else 'wider' if absolute_change > 0 else 'unchanged'
            path = 'both_improve' if dn > 0 and dr > 0 else 'new_weaker_resale_better' if dn < 0 and dr > 0 else 'both_weaker' if dn < 0 and dr < 0 else 'other'
            comparison.append(dict(city=c, start_new=a[0], start_resale=a[1], end_new=b[0], end_resale=b[1],
                delta_new=dn, delta_resale=dr, signed_gap_change=dn-dr, absolute_gap_change=absolute_change,
                direction=direction, path=path))
        result['convergence'] = dict(start=start, end=latest, cities=comparison,
            directions=dict(Counter(d['direction'] for d in comparison)),
            narrowing_paths=dict(Counter(d['path'] for d in comparison if d['direction']=='narrower')))
    for kind in ('new', 'resale'):
        for metric in ('mom', 'yoy'):
            for lag in (1, 3, 6, 12, 24):
                correlations=[]
                for i in range(len(months)-lag):
                    pairs=[(rate(months[i],c,kind,metric),rate(months[i+lag],c,kind,metric)) for c in cities]
                    pairs=[(a,b) for a,b in pairs if a is not None and b is not None]
                    if len(pairs)<3:
                        continue
                    rho=spearman([p[0] for p in pairs],[p[1] for p in pairs])
                    if rho is not None:
                        correlations.append(dict(start=months[i],end=months[i+lag],rho=rho,n=len(pairs)))
                if correlations:
                    result['rank_stability'].append(dict(type=kind,metric=metric,lag=lag,
                        mean=stats.mean(d['rho'] for d in correlations),pairs=correlations))
    # A comparability check, not a claim that differently weighted vintages are identical.
    residuals=[]
    for i in range(12,len(months)):
        for kind in ('new','resale'):
            for c in cities:
                vs=[rate(months[i],c,kind,'yoy'),rate(months[i-1],c,kind,'yoy'),rate(months[i],c,kind),rate(months[i-12],c,kind)]
                if None in vs:
                    continue
                residual=100*((1000+vs[0])/(1000+vs[1])-(1000+vs[2])/(1000+vs[3]))
                residuals.append(dict(city=c,month=months[i],type=kind,residual=residual))
    result['consistency_diagnostic']=dict(definition='100 * (YoY_index[t]/YoY_index[t-1] - MoM_index[t]/MoM_index[t-12])',
        note='Published vintages can differ in weights/base and are rounded. No exact base-effect contribution percentages are inferred.',
        largest=sorted(residuals,key=lambda d:abs(d['residual']),reverse=True)[:10])
    return result


def figures(result):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.font_manager import FontProperties
    font_path=Path('C:/Windows/Fonts/msyh.ttc')
    if font_path.exists():
        plt.rcParams['font.family']=FontProperties(fname=str(font_path)).get_name()
    plt.rcParams.update({'axes.unicode_minus':False,'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
    fig,axs=plt.subplots(2,2,figsize=(12.8,8.8),layout='constrained')
    fig.patch.set_facecolor('#eeece5')
    teal,orange,gray='#bf4b30','#3c668a','#9ca994'
    ax=axs[0,0]
    for i,t in enumerate(('new','resale')):
        row=result['recovery'][t][-1]['matrix']['improving']
        left=0
        for status,col,label in [('down',teal,'当月仍下跌'),('flat',gray,'当月持平'),('up',orange,'当月上涨')]:
            count=len(row[status]); ax.barh(i,count,left=left,color=col,label=label if i==0 else None)
            if count:ax.text(left+count/2,i,str(count),ha='center',va='center',color='white',fontweight='bold')
            left+=count
    ax.set(yticks=[0,1],yticklabels=['新房','二手房'],xlim=(0,70),xlabel='城市数（仅统计同比表现较上月改善的城市）',title='① 同比改善，不等于这个月已经上涨')
    ax.legend(loc='upper right',frameon=False,fontsize=9)
    ax=axs[0,1]
    for t,col,label,offset in [('new',teal,'新房',-.16),('resale',orange,'二手房',.16)]:
        counts=[len(d['positive']) for d in result['runs'][t]]
        bars=ax.bar([i+offset for i in range(3)],counts,width=.3,color=col,label=label)
        ax.bar_label(bars,padding=3)
    ax.set(xticks=[0,1,2],xticklabels=['当月上涨','连续3个月上涨','连续6个月上涨'],ylabel='城市数',ylim=(0,22),title='② 持续上涨的城市，比单月上涨少得多')
    ax.legend(frameon=False)
    ax=axs[1,0]
    conv=result['convergence']; paths=conv.get('narrowing_paths',{})
    labels=['两类同比均改善','新房同比走弱\n二手房同比改善','两类同比均走弱','一类同比不变']
    vals=[paths.get(k,0) for k in ('both_improve','new_weaker_resale_better','both_weaker','other')]
    bars=ax.bar(range(4),vals,color=[teal,orange,'#899683','#bbc3b3']);ax.bar_label(bars,padding=3)
    ax.set(xticks=range(4),xticklabels=labels,ylabel='城市数',ylim=(0,30),title=f'③ 差距缩小的{sum(vals)}城，并非都在共同改善')
    ax.text(0,-.27,f"{conv['start']} → {conv['end']}；按新旧房同比差值的绝对值判断收敛",transform=ax.transAxes,fontsize=9,color='#66715f')
    ax=axs[1,1]
    for metric,style in [('yoy','-'),('mom','--')]:
        for t,col in [('new',teal),('resale',orange)]:
            ds=[d for d in result['rank_stability'] if d['metric']==metric and d['type']==t]
            ax.plot([d['lag'] for d in ds],[d['mean'] for d in ds],style,color=col,marker='o',label=('新房' if t=='new' else '二手房')+('同比' if metric=='yoy' else '环比'))
    ax.axhline(0,color='#bdc6b7',lw=.8);ax.set(xticks=[1,3,6,12,24],xlabel='间隔月数',ylabel='城市排序 Spearman 相关系数',ylim=(-.2,1.05),title='④ 同比排序的短期稳定，不等于长期优势')
    ax.legend(frameon=False,ncol=2,fontsize=9)
    fig.suptitle(f"70城住房价格：把‘改善’拆开看｜截至 {result['latest']}",fontsize=17,fontweight='bold')
    fig.savefig(OUT/'dynamics.png',dpi=180,facecolor=fig.get_facecolor())
    fig.savefig(OUT/'dynamics.svg',facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--figures',action='store_true');args=parser.parse_args()
    source=ROOT/'data/housing.json';rows=json.loads(source.read_text(encoding='utf-8'))
    result=analyze(rows)
    result['provenance']=dict(source='data/housing.json',sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        created_at=datetime.now(timezone.utc).isoformat(),method='Descriptive counts and within-city comparisons; no causal or predictive inference.')
    OUT.mkdir(exist_ok=True)
    (OUT/'dynamics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    if args.figures:figures(result)
    print('Wrote analysis/dynamics.json'+(' and dynamics.png/svg' if args.figures else ''))


if __name__=='__main__':main()
